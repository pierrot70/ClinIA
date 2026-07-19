import { assessCloudClinicalPayload } from "../utils/requestSafety.js";

function buildType2DiabetesContextPrompt(patient = {}) {
    const context = patient?.diabetes_context;
    if (!context || typeof context !== "object") {
        return "";
    }

    const contextEntries = [
        ["weight_band", patient.weight_band],
        ["age_band", patient.age_band],
        ["cardiovascular_risk", context.cardiovascular_risk],
        ["renal_function", context.renal_function],
        ["fragility", context.fragility],
        ["tolerance", context.tolerance],
        ["glycemic_goals", context.glycemic_goals],
    ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "");

    if (contextEntries.length === 0) {
        return "";
    }

    const formattedContext = contextEntries
        .map(([label, value]) => `- ${label}: ${value}`)
        .join("\n");

    return `\nAdditional type 2 diabetes clinical context:\n${formattedContext}\nUse this additional context when comparing therapeutic options, monitoring points, and cautions.`;
}

export async function executeOpenAIAnalyze({
    openai,
    model,
    diagnosis,
    patient,
    symptoms,
    reqAuth,
    req,
    fingerprint,
    forceRealSafe,
    neutralizationMeta,
    supportsJsonResponseFormat,
    recordOpenAIRequestAuditEvent,
    finalizeOpenAIRequestAuditEvent,
    getRequestIp,
    makeSourceHash,
    detectNonSecureContent,
    respondWithSecurityIncident,
    safeParseMedicalAI,
    normalizeClinicalAnalysis,
    isPlaceholderClinicalAnalysis,
    recordOpenAISuccess,
    recordOpenAIFailure,
    res,
    logger = console,
}) {
    const cloudAssessment = assessCloudClinicalPayload({
        ...patient,
        diagnosis,
        symptoms,
    });
    if (!cloudAssessment.approved) {
        return {
            ok: false,
            response: res.status(400).json({
                error: {
                    code: "UNAPPROVED_CLOUD_CLINICAL_CONTENT",
                    message:
                        "L'analyse OpenAI exige des concepts cliniques approuves. Le texte libre demeure dans ClinIA et n'a pas ete transmis.",
                    retryable: false,
                    stage: "openai_preflight",
                    fields: cloudAssessment.rejectedFields,
                },
            }),
        };
    }

    diagnosis = cloudAssessment.primaryConcern;
    symptoms = cloudAssessment.cloudPayload.symptoms ?? [];
    patient = cloudAssessment.cloudPayload;

    const diagnosisLower = String(diagnosis || "").toLowerCase();
    const isType2DiabetesCase =
        diagnosisLower.includes("diab") ||
        diagnosisLower.includes("type 2") ||
        diagnosisLower.includes("diabetes");

    const diabetesInstruction = isType2DiabetesCase
        ? "For type 2 diabetes cases, explicitly structure the response so the clinician can compare: current strategy, whether a GLP-1 option may merit reevaluation, key cardiometabolic factors to review, cautions, and a neutral conclusion. Do not recommend prescribing, do not instruct replacing metformin automatically, do not provide dosing, and keep the final decision explicitly with the clinician."
        : "";
    const diabetesContextPrompt = isType2DiabetesCase
        ? buildType2DiabetesContextPrompt(patient)
        : "";

    const baseRequest = {
        model,
        messages: [
            {
                role: "system",
                content:
                    `You are ClinIA, a clinical decision support AI. Provide structured therapeutic options, monitoring, red flags, and a clinician-facing summary for the primary clinical concern or confirmed diagnosis supplied by the user. Do not issue a final diagnosis, do not prescribe autonomously, and return valid JSON only. ${diabetesInstruction}`.trim(),
            },
            {
                role: "user",
                content:
                    `Primary clinical concern or confirmed diagnosis: ${diagnosis}. Provide evidence-based therapeutic options, monitoring considerations, contraindications, red flags, and a concise patient summary for this clinical context only. ${isType2DiabetesCase ? "If appropriate to the clinical context, compare continuing the current strategy with reevaluating a GLP-1 option, while remaining neutral and non-prescriptive." : ""} The final medical decision remains with the clinician.${diabetesContextPrompt}\nFull patient data: ${JSON.stringify(patient)}`,
            },
        ],
        temperature: 0.1,
    };

    const request = supportsJsonResponseFormat(model)
        ? {
            ...baseRequest,
            response_format: { type: "json_object" },
        }
        : baseRequest;

    let openAIRequestAudit = null;

    try {
        const requestPayloadText = JSON.stringify(request);
        openAIRequestAudit = await recordOpenAIRequestAuditEvent({
            action: "AI_ANALYZE_REQUEST",
            outcome: "SENT",
            actorUserId: reqAuth?.userId ?? null,
            actorUsername: reqAuth?.username ?? null,
            actorRole: reqAuth?.role ?? null,
            ip: getRequestIp(req),
            requestPath: "/api/ai/analyze",
            model,
            payloadHash: makeSourceHash(request),
            payloadSizeBytes: Buffer.byteLength(requestPayloadText, "utf8"),
            requestContext: {
                fingerprint,
                diagnosisHash: makeSourceHash({ diagnosis }),
                cloudPayloadProfile: "CONTROLLED_CLINICAL_V2",
                symptomCount: Array.isArray(symptoms) ? symptoms.length : 0,
                medicalHistoryCount: Array.isArray(patient.medical_history)
                    ? patient.medical_history.length
                    : 0,
                currentMedicationCount: Array.isArray(patient.current_medications)
                    ? patient.current_medications.length
                    : 0,
                forceReal: forceRealSafe,
                neutralized: neutralizationMeta?.neutralized === true,
            },
            acknowledgmentIncidentId:
                neutralizationMeta?.acknowledgmentIncidentId ?? null,
            neutralized: neutralizationMeta?.neutralized === true,
        });

        const completion = await openai.chat.completions.create(request);
        const rawContent = completion?.choices?.[0]?.message?.content || "";

        logger.log("OPENAI_RESPONSE_RECEIVED", {
            model,
            upstreamRequestId: completion?.id || null,
            responseBytes: Buffer.byteLength(rawContent, "utf8"),
        });

        const postCloudScan = detectNonSecureContent(rawContent);
        if (postCloudScan.hasMatches) {
            await finalizeOpenAIRequestAuditEvent(openAIRequestAudit?._id, {
                outcome: "FAILED",
                upstreamRequestId: completion?.id || null,
                errorCode: "POST_CLOUD_IDENTIFIER_DETECTED",
            });
            return {
                ok: false,
                response: await respondWithSecurityIncident({
                    res,
                    phase: "post_cloud",
                    reason:
                        "Non-secure patient identifiers detected after cloud transmission.",
                    requestPath: "/api/ai/analyze",
                    matches: postCloudScan.matches,
                    context: {
                        model,
                        direction: "response",
                    },
                }),
            };
        }

        const parsed = safeParseMedicalAI(rawContent);
        const normalized = normalizeClinicalAnalysis(parsed, {
            model,
            primaryConcern: diagnosis,
        });

        if (isPlaceholderClinicalAnalysis(normalized)) {
            await finalizeOpenAIRequestAuditEvent(openAIRequestAudit?._id, {
                outcome: "FAILED",
                upstreamRequestId: completion?.id || null,
                errorCode: "OPENAI_INVALID_RESPONSE",
            });
            logger.error("❌ OpenAI returned an unusable clinical payload", {
                model,
                rawContentLength: rawContent.length,
            });

            return {
                ok: false,
                response: res.status(502).json({
                    error: {
                        code: "OPENAI_INVALID_RESPONSE",
                        message:
                            "Le service OpenAI a retourne une reponse clinique inutilisable. Reessayez plus tard.",
                        retryable: true,
                    },
                }),
            };
        }

        recordOpenAISuccess();
        await finalizeOpenAIRequestAuditEvent(openAIRequestAudit?._id, {
            outcome: "SUCCESS",
            upstreamRequestId: completion?.id || null,
        });

        return { ok: true, normalized };
    } catch (err) {
        await finalizeOpenAIRequestAuditEvent(openAIRequestAudit?._id, {
            outcome: "FAILED",
            errorCode: "OPENAI_UPSTREAM_FAILED",
        });
        logger.error("❌ OpenAI error:", err.message);
        recordOpenAIFailure();

        return {
            ok: false,
            response: res.status(502).json({
                error: {
                    code: "OPENAI_UPSTREAM_FAILED",
                    message:
                        "Le service OpenAI est indisponible. Corrigez le contenu ou reessayez plus tard.",
                    retryable: true,
                },
            }),
        };
    }
}
