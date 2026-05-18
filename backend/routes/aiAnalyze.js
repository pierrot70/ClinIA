import express from "express";

import { attachOptionalAuth } from "../middleware/attachOptionalAuth.js";
import { clinicalDemoRateLimiter } from "../middleware/clinicalDemoRateLimiter.js";
import { openAIAnalyzeQuotaGuard, getOpenAIAnalyzeQuotaStatus } from "../middleware/openaiAnalyzeQuotaGuard.js";

export function createAiAnalyzeRouter(deps) {
    const {
        openai,
        sanitizeRequestPayload,
        detectPromptInjection,
        extractPrimaryClinicalConcern,
        detectNonSecureContent,
        getAcknowledgedSecurityIncident,
        respondWithSecurityIncident,
        getRequestIp,
        makeSourceHash,
        makeFingerprint,
        findPersistedDiagnosisByFingerprint,
        upgradePersistedDiagnosisOutput,
        normalizeClinicalAnalysis,
        isPlaceholderClinicalAnalysis,
        getMockForDiagnosis,
        persistOrReuseDiagnosis,
        canCallOpenAI,
        supportsJsonResponseFormat,
        recordOpenAIRequestAuditEvent,
        finalizeOpenAIRequestAuditEvent,
        safeParseMedicalAI,
        recordOpenAISuccess,
        recordOpenAIFailure,
        sanitizeNonSecureContent,
    } = deps;

    const router = express.Router();

    router.get("/analyze-status", (_req, res) => {
        return res.status(200).json({
            data: getOpenAIAnalyzeQuotaStatus(),
            meta: {
                source: "real",
                model: "quota_guard",
            },
        });
    });

    router.post(
        "/analyze",
        attachOptionalAuth,
        openAIAnalyzeQuotaGuard,
        (req, res, next) => {
            if (!req.auth) {
                return clinicalDemoRateLimiter(req, res, next);
            }
            return next();
        },
        async (req, res) => {
            try {
                const safeBody = sanitizeRequestPayload(req.body ?? {});
                const promptInjectionScan = detectPromptInjection(safeBody);
                if (promptInjectionScan.hasMatch) {
                    return res.status(400).json({
                        error: {
                            code: "PROMPT_INJECTION_DETECTED",
                            message:
                                "La requete contient des instructions non autorisees.",
                            retryable: false,
                        },
                    });
                }

                const {
                    symptoms = [],
                    forceReal,
                    openaiModel,
                    incidentAckId,
                } = safeBody;

                const diagnosisInput =
                    typeof safeBody.diagnosis === "string"
                        ? safeBody.diagnosis.trim()
                        : "";

                if (
                    (!Array.isArray(symptoms) || symptoms.length === 0) &&
                    !diagnosisInput
                ) {
                    return res.json({
                        error: {
                            code: "INVALID_INPUT",
                            message:
                                "Entrez au moins un symptome ou un diagnostic / motif clinique principal.",
                            retryable: false,
                        },
                    });
                }

                const diagnosisSeed = Array.isArray(symptoms)
                    ? symptoms.join(" ")
                    : "";
                const diagnosis = extractPrimaryClinicalConcern({
                    diagnosis: diagnosisInput,
                    symptoms,
                }) || diagnosisSeed || "To be determined by ClinIA";
                const patient = safeBody;
                let neutralizationMeta = null;
                const fingerprint = makeFingerprint({ diagnosis, patient });

                const isProd = process.env.NODE_ENV === "production";
                const forceMock = process.env.CLINIA_FORCE_MOCK === "true";
                const mockEnabled = process.env.CLINIA_MOCK_AI === "true";
                const forceRealSafe = !forceMock && forceReal === true;

                if (forceMock && forceReal === true) {
                    console.warn("⚠️ forceReal ignored because CLINIA_FORCE_MOCK=true");
                }

                const useMock = (forceMock || mockEnabled) && !forceRealSafe;

                const model =
                    openaiModel || process.env.OPENAI_MODEL;

                console.log("AI_REQUEST from Frontend", {
                    model,
                    forceReal: forceRealSafe,
                    useMock,
                    circuitOpen: !canCallOpenAI(),
                    symptomCount: Array.isArray(symptoms)
                        ? symptoms.length
                        : 0,
                    isProd,
                });

                const preCloudScan = detectNonSecureContent(patient);
                if (preCloudScan.hasMatches) {
                    const ackedIncident = incidentAckId
                        ? await getAcknowledgedSecurityIncident(incidentAckId)
                        : null;

                    if (!ackedIncident) {
                        return respondWithSecurityIncident({
                            res,
                            phase: "pre_cloud",
                            reason:
                                "Non-secure patient identifiers detected before cloud transmission.",
                            requestPath: "/api/ai/analyze",
                            matches: preCloudScan.matches,
                            context: {
                                model,
                                direction: "request",
                            },
                            auditEvent: {
                                actorUserId: req.auth?.userId ?? null,
                                actorUsername: req.auth?.username ?? null,
                                actorRole: req.auth?.role ?? null,
                                ip: getRequestIp(req),
                                model,
                                payloadHash: makeSourceHash(patient),
                                payloadSizeBytes: Buffer.byteLength(
                                    JSON.stringify(patient),
                                    "utf8"
                                ),
                                requestContext: {
                                    fingerprint,
                                    diagnosisHash: makeSourceHash({ diagnosis }),
                                    symptomCount: Array.isArray(symptoms)
                                        ? symptoms.length
                                        : 0,
                                    medicalHistoryCount: Array.isArray(
                                        patient.medical_history
                                    )
                                        ? patient.medical_history.length
                                        : 0,
                                    currentMedicationCount: Array.isArray(
                                        patient.current_medications
                                    )
                                        ? patient.current_medications.length
                                        : 0,
                                    forceReal: forceRealSafe,
                                    direction: "request",
                                },
                            },
                        });
                    }

                    const sanitizedPatient = sanitizeNonSecureContent(patient);
                    neutralizationMeta = {
                        neutralized: true,
                        acknowledgmentIncidentId: String(ackedIncident._id),
                        originalMatches: preCloudScan.matches,
                        message:
                            "Requete contenant des donnees sensibles neutralisee apres acknowledgment explicite du clinicien.",
                    };

                    Object.assign(patient, sanitizedPatient);
                }

                const cachedDiagnosis = await findPersistedDiagnosisByFingerprint(
                    fingerprint
                );
                const cachedPrimaryConcern = extractPrimaryClinicalConcern({
                    diagnosis: cachedDiagnosis?.input?.diagnosis,
                    symptoms: cachedDiagnosis?.input?.symptoms,
                });
                const normalizedCachedOutput = cachedDiagnosis?.output
                    ? normalizeClinicalAnalysis(cachedDiagnosis.output, {
                        model: cachedDiagnosis.model ?? model ?? "cache",
                        primaryConcern: cachedPrimaryConcern,
                    })
                    : null;
                const cachedDiagnosisIsPlaceholderReal =
                    cachedDiagnosis?.mode === "real" &&
                    isPlaceholderClinicalAnalysis(normalizedCachedOutput);
                const canReuseCachedDiagnosis =
                    normalizedCachedOutput &&
                    !cachedDiagnosisIsPlaceholderReal &&
                    !(forceRealSafe && cachedDiagnosis?.mode === "real") &&
                    (cachedDiagnosis.mode !== "mock" || useMock);

                if (cachedDiagnosisIsPlaceholderReal) {
                    console.log("AI_CACHE_SKIP_PLACEHOLDER_REAL", {
                        fingerprint,
                        cachedMode: cachedDiagnosis.mode,
                        requestedMode: useMock ? "mock" : "real",
                    });
                }

                if (forceRealSafe && cachedDiagnosis?.mode === "real") {
                    console.log("AI_CACHE_SKIP_FORCE_REAL", {
                        fingerprint,
                        cachedMode: cachedDiagnosis.mode,
                    });
                }

                if (canReuseCachedDiagnosis) {
                    const cacheNeedsUpgrade =
                        JSON.stringify(cachedDiagnosis.output) !==
                        JSON.stringify(normalizedCachedOutput);

                    if (cacheNeedsUpgrade) {
                        upgradePersistedDiagnosisOutput(
                            fingerprint,
                            normalizedCachedOutput
                        );
                    }

                    console.log("AI_CACHE_HIT", {
                        fingerprint,
                        mode: cachedDiagnosis.mode,
                        model: cachedDiagnosis.model,
                    });

                    return res.json({
                        data: normalizedCachedOutput,
                        meta: {
                            source: cachedDiagnosis.mode,
                            model: cachedDiagnosis.model ?? model ?? "cache",
                            cacheHit: true,
                            ...neutralizationMeta,
                        },
                    });
                }

                if (cachedDiagnosis?.mode === "mock" && !useMock) {
                    console.log("AI_CACHE_SKIP_MOCK", {
                        fingerprint,
                        cachedMode: cachedDiagnosis.mode,
                        requestedMode: "real",
                    });
                }

                if (useMock) {
                    const mock = getMockForDiagnosis(diagnosisSeed || diagnosis);
                    const analysis = normalizeClinicalAnalysis(mock, {
                        model: "mock",
                        primaryConcern: diagnosis,
                    });

                    const persist = await persistOrReuseDiagnosis({
                        fingerprint,
                        input: patient,
                        output: analysis,
                        mode: "mock",
                        model: "mock",
                    });

                    if (!persist.ok) {
                        return res.json({ error: persist.error });
                    }

                    return res.json({
                        data: persist.doc.output,
                        meta: {
                            source: "mock",
                            model: "mock",
                            ...neutralizationMeta,
                        },
                    });
                }

                if (!canCallOpenAI() && !forceRealSafe) {
                    const degraded = normalizeClinicalAnalysis({}, {
                        model: "fallback",
                        primaryConcern: diagnosis,
                    });
                    return res.json({
                        data: degraded,
                        meta: {
                            source: "degraded",
                            model: "fallback",
                            ...neutralizationMeta,
                        },
                    });
                }

                const baseRequest = {
                    model,
                    messages: [
                        {
                            role: "system",
                            content:
                                "You are ClinIA, a clinical decision support AI. Provide structured therapeutic options, monitoring, red flags, and a clinician-facing summary for the primary clinical concern or confirmed diagnosis supplied by the user. Do not issue a final diagnosis, do not prescribe autonomously, and return valid JSON only.",
                        },
                        {
                            role: "user",
                            content:
                                `Primary clinical concern or confirmed diagnosis: ${diagnosis}. Provide evidence-based therapeutic options, monitoring considerations, contraindications, red flags, and a concise patient summary for this clinical context only. The final medical decision remains with the clinician.\nFull patient data: ${JSON.stringify(patient)}`,
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

                let normalized;
                let rawContent = "";
                let openAIRequestAudit = null;

                try {
                    const requestPayloadText = JSON.stringify(request);
                    openAIRequestAudit = await recordOpenAIRequestAuditEvent({
                        action: "AI_ANALYZE_REQUEST",
                        outcome: "SENT",
                        actorUserId: req.auth?.userId ?? null,
                        actorUsername: req.auth?.username ?? null,
                        actorRole: req.auth?.role ?? null,
                        ip: getRequestIp(req),
                        requestPath: "/api/ai/analyze",
                        model,
                        payloadHash: makeSourceHash(request),
                        payloadSizeBytes: Buffer.byteLength(requestPayloadText, "utf8"),
                        requestContext: {
                            fingerprint,
                            diagnosisHash: makeSourceHash({ diagnosis }),
                            symptomCount: Array.isArray(symptoms)
                                ? symptoms.length
                                : 0,
                            medicalHistoryCount: Array.isArray(patient.medical_history)
                                ? patient.medical_history.length
                                : 0,
                            currentMedicationCount: Array.isArray(
                                patient.current_medications
                            )
                                ? patient.current_medications.length
                                : 0,
                            forceReal: forceRealSafe,
                            neutralized: neutralizationMeta?.neutralized === true,
                        },
                        acknowledgmentIncidentId:
                            neutralizationMeta?.acknowledgmentIncidentId ?? null,
                        neutralized: neutralizationMeta?.neutralized === true,
                    });

                    const completion =
                        await openai.chat.completions.create(
                            request
                        );

                    rawContent =
                        completion?.choices?.[0]?.message?.content || "";

                    console.log("=== RAW OpenAI RESPONSE ===\n", rawContent, "\n===========================");

                    const postCloudScan = detectNonSecureContent(rawContent);
                    if (postCloudScan.hasMatches) {
                        await finalizeOpenAIRequestAuditEvent(
                            openAIRequestAudit?._id,
                            {
                                outcome: "FAILED",
                                upstreamRequestId: completion?.id || null,
                                errorCode: "POST_CLOUD_IDENTIFIER_DETECTED",
                            }
                        );
                        return respondWithSecurityIncident({
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
                        });
                    }

                    const parsed = safeParseMedicalAI(
                        rawContent
                    );

                    normalized = normalizeClinicalAnalysis(parsed, {
                        model,
                        primaryConcern: diagnosis,
                    });

                    if (isPlaceholderClinicalAnalysis(normalized)) {
                        await finalizeOpenAIRequestAuditEvent(
                            openAIRequestAudit?._id,
                            {
                                outcome: "FAILED",
                                upstreamRequestId: completion?.id || null,
                                errorCode: "OPENAI_INVALID_RESPONSE",
                            }
                        );
                        console.error("❌ OpenAI returned an unusable clinical payload", {
                            model,
                            diagnosis,
                            rawContentLength: rawContent.length,
                        });

                        return res.status(502).json({
                            error: {
                                code: "OPENAI_INVALID_RESPONSE",
                                message:
                                    "Le service OpenAI a retourne une reponse clinique inutilisable. Reessayez plus tard.",
                                retryable: true,
                            },
                        });
                    }

                    recordOpenAISuccess();
                    await finalizeOpenAIRequestAuditEvent(
                        openAIRequestAudit?._id,
                        {
                            outcome: "SUCCESS",
                            upstreamRequestId: completion?.id || null,
                        }
                    );
                } catch (err) {
                    await finalizeOpenAIRequestAuditEvent(
                        openAIRequestAudit?._id,
                        {
                            outcome: "FAILED",
                            errorCode: "OPENAI_UPSTREAM_FAILED",
                        }
                    );
                    console.error("❌ OpenAI error:", err.message);
                    recordOpenAIFailure();

                    return res.status(502).json({
                        error: {
                            code: "OPENAI_UPSTREAM_FAILED",
                            message:
                                "Le service OpenAI est indisponible. Corrigez le contenu ou reessayez plus tard.",
                            retryable: true,
                        },
                    });
                }

                const persist = await persistOrReuseDiagnosis({
                    fingerprint,
                    input: patient,
                    output: normalized,
                    mode: "real",
                    model: model ?? "unknown",
                    replaceExisting: forceRealSafe,
                });

                console.log("AI_RESPONSE From OpenAI", {
                    model,
                    source: "real",
                    hasDiagnosis: Boolean(normalized?.diagnosis?.suspected),
                });

                if (!persist.ok) {
                    return res.status(500).json({ error: persist.error });
                }

                const responsePayload = {
                    data: persist.doc.output,
                    meta: {
                        source: "real",
                        model,
                        ...neutralizationMeta,
                    },
                };
                console.log("=== RESPONSE TO FRONTEND ===\n", JSON.stringify(responsePayload, null, 2), "\n============================");
                return res.json(responsePayload);
            } catch (err) {
                console.error("🔥 FATAL /api/ai/analyze ERROR", err);
                return res.status(500).json({
                    error: {
                        code: "INTERNAL_ERROR",
                        message:
                            "Erreur interne du service ClinIA.",
                        retryable: true,
                    },
                });
            }
        }
    );

    return router;
}
