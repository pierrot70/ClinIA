import express from "express";
import { buildFingerprintPatientPayload } from "../services/aiAnalyzeCacheService.js";
import { AUTH_ROLES } from "../auth/constants.js";

import { attachOptionalAuth } from "../middleware/attachOptionalAuth.js";
import { clinicalDemoRateLimiter } from "../middleware/clinicalDemoRateLimiter.js";
import { openAIAnalyzeQuotaGuard, getOpenAIAnalyzeQuotaStatus } from "../middleware/openaiAnalyzeQuotaGuard.js";
import { resolveCachedDiagnosisState } from "../services/aiAnalyzeCacheService.js";
import { resolvePreCloudSecurityState } from "../services/aiAnalyzePreCloudService.js";
import { executeOpenAIAnalyze } from "../services/aiAnalyzeOpenAIService.js";
import {
    buildDegradedAnalyzeResponse,
    buildMockAnalyzeResponse,
    buildPersistedRealAnalyzeResponse,
} from "../services/aiAnalyzeResponseService.js";
import { createWriteVerificationContext } from "../audit/writeVerification.js";
import { resolveAnalyzeExecutionMode } from "../services/aiAnalyzeAccessService.js";
import { resolveOpenAIModel } from "../services/aiModelPolicy.js";
import { requireRole } from "../middleware/requireRole.js";
import { getRequestContext } from "../app/requestContext.js";
import { getSafeRequestPath, logSafeError } from "../utils/requestLogSafety.js";

export function createAiAnalyzeRouter(deps) {
    const {
        openai,
        assessCloudClinicalPayload,
        buildCloudSafePatientPayload,
        sanitizeRequestPayload,
        validateAnalyzeRequestShape,
        validateClinicalInputBounds,
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

    router.get(
        "/analyze-status",
        attachOptionalAuth,
        requireRole(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPERADMIN),
        (_req, res) => {
            return res.status(200).json({
                data: getOpenAIAnalyzeQuotaStatus(),
                meta: {
                    source: "real",
                    model: "quota_guard",
                },
            });
        }
    );

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
                const shapeCheck = validateAnalyzeRequestShape(req.body ?? {});
                if (!shapeCheck.valid) {
                    return res.status(400).json({
                        error: {
                            code: "INVALID_CLINICAL_REQUEST_SHAPE",
                            message:
                                "La requete clinique contient des champs non autorises.",
                            retryable: false,
                            fields: shapeCheck.invalidFields,
                        },
                    });
                }
                const safeBody = sanitizeRequestPayload(req.body ?? {});
                const boundaryCheck = validateClinicalInputBounds(safeBody);
                if (!boundaryCheck.valid) {
                    return res.status(400).json({
                        error: {
                            code: "INVALID_CLINICAL_INPUT_BOUNDARY",
                            message:
                                "Les paramètres cliniques dépassent les limites autorisées.",
                            retryable: false,
                            fields: boundaryCheck.invalidFields,
                        },
                    });
                }
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
                    reverifyRequested,
                } = safeBody;

                if (
                    reverifyRequested === true &&
                    req.auth?.role !== AUTH_ROLES.SUPERADMIN
                ) {
                    return res.status(403).json({
                        error: {
                            code: "INTERNAL_ERROR",
                            message:
                                "Seul un SUPERADMIN peut relancer une analyse verifiee.",
                            retryable: false,
                        },
                    });
                }

                const modelPolicy = resolveOpenAIModel({
                    requestedModel: openaiModel,
                    role: req.auth?.role,
                });
                if (!modelPolicy.allowed) {
                    return res.status(modelPolicy.status).json({
                        error: {
                            code: modelPolicy.code,
                            message: modelPolicy.message,
                            retryable: false,
                        },
                    });
                }

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
                const requestContext = getRequestContext(req);
                const shouldPersistDiagnosis = Boolean(req.auth?.userId);
                const writeVerification = shouldPersistDiagnosis
                    ? createWriteVerificationContext(req)
                    : null;
                const writeAudit = shouldPersistDiagnosis
                    ? {
                          actorUserId: req.auth.userId,
                          actorUsername: req.auth.username ?? null,
                          actorRole: req.auth.role ?? null,
                          ip: getRequestIp(req),
                          requestId: requestContext.requestId,
                          instanceId: requestContext.instanceId,
                          verificationId: writeVerification.verificationId,
                          clientMutationId: writeVerification.clientMutationId,
                          requestPath: getSafeRequestPath(req),
                      }
                    : null;
                let cloudSafePatient = buildCloudSafePatientPayload(patient);
                let neutralizationMeta = null;
                const model = modelPolicy.model;
                const fingerprint = makeFingerprint({
                    diagnosis,
                    patient: buildFingerprintPatientPayload(patient),
                    model,
                });

                const isProd = process.env.NODE_ENV === "production";
                const forceMock = process.env.CLINIA_FORCE_MOCK === "true";
                const mockEnabled = process.env.CLINIA_MOCK_AI === "true";
                const {
                    authenticated,
                    forceRealSafe,
                    useMock,
                } = resolveAnalyzeExecutionMode({
                    authUser: req.auth,
                    forceMock,
                    mockEnabled,
                    forceReal,
                });

                if (!authenticated && forceReal === true) {
                    console.warn("⚠️ anonymous forceReal ignored");
                } else if (forceMock && forceReal === true) {
                    console.warn("⚠️ forceReal ignored because CLINIA_FORCE_MOCK=true");
                }

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

                const preCloudState = await resolvePreCloudSecurityState({
                    patient,
                    incidentAckId,
                    model,
                    reqAuth: req.auth,
                    req,
                    fingerprint,
                    diagnosis,
                    symptoms,
                    detectNonSecureContent,
                    getAcknowledgedSecurityIncident,
                    respondWithSecurityIncident,
                    getRequestIp,
                    makeSourceHash,
                    sanitizeNonSecureContent,
                    res,
                    forceRealSafe,
                });

                if (preCloudState.blocked) {
                    return preCloudState.response;
                }

                if (preCloudState.sanitizedPatient) {
                    neutralizationMeta = preCloudState.neutralizationMeta;
                    Object.assign(patient, preCloudState.sanitizedPatient);
                    cloudSafePatient = buildCloudSafePatientPayload(patient);
                }

                const cloudAssessment = assessCloudClinicalPayload(patient);
                cloudSafePatient = cloudAssessment.cloudPayload;

                if (!cloudAssessment.approved) {
                    return res.status(400).json({
                        error: {
                            code: "UNAPPROVED_CLOUD_CLINICAL_CONTENT",
                            message:
                                "L'analyse OpenAI exige des concepts cliniques approuves. Le texte libre demeure dans ClinIA et n'a pas ete transmis.",
                            retryable: false,
                            stage: "route_preflight",
                            fields: cloudAssessment.rejectedFields,
                        },
                    });
                }

                const cachedDiagnosis = shouldPersistDiagnosis
                    ? await findPersistedDiagnosisByFingerprint(fingerprint)
                    : null;
                const {
                    normalizedCachedOutput,
                    cachedDiagnosisIsPlaceholderReal,
                    canReuseCachedDiagnosis,
                    cacheNeedsUpgrade,
                } = resolveCachedDiagnosisState({
                    cachedDiagnosis,
                    model,
                    forceRealSafe,
                    useMock,
                    extractPrimaryClinicalConcern,
                    normalizeClinicalAnalysis,
                    isPlaceholderClinicalAnalysis,
                });
                const shouldBypassCacheForReverify =
                    reverifyRequested === true;

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

                if (canReuseCachedDiagnosis && !shouldBypassCacheForReverify) {
                    if (cacheNeedsUpgrade) {
                        upgradePersistedDiagnosisOutput(
                            fingerprint,
                            normalizedCachedOutput,
                            { writeAudit }
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
                    const mockResult = await buildMockAnalyzeResponse({
                        diagnosisSeed,
                        diagnosis,
                        fingerprint,
                        patient,
                        neutralizationMeta,
                        getMockForDiagnosis,
                        normalizeClinicalAnalysis,
                        persistOrReuseDiagnosis,
                        writeAudit,
                        writeVerification,
                        reverifyRequested: reverifyRequested === true,
                        reqAuth: req.auth,
                        persist: shouldPersistDiagnosis,
                    });

                    if (!mockResult.ok) {
                        return res.json({ error: mockResult.error });
                    }

                    return res.json(mockResult.responsePayload);
                }

                if (!canCallOpenAI() && !forceRealSafe) {
                    return res.json(
                        buildDegradedAnalyzeResponse({
                            diagnosis,
                            neutralizationMeta,
                            normalizeClinicalAnalysis,
                        })
                    );
                }

                const openAIResult = await executeOpenAIAnalyze({
                    openai,
                    model,
                    diagnosis: cloudAssessment.primaryConcern,
                    patient: cloudSafePatient,
                    symptoms: cloudSafePatient.symptoms ?? [],
                    reqAuth: req.auth,
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
                });

                if (!openAIResult.ok) {
                    return openAIResult.response;
                }

                const normalized = openAIResult.normalized;

                const finalResult = await buildPersistedRealAnalyzeResponse({
                    fingerprint,
                    patient,
                    normalized,
                    model,
                    forceRealSafe,
                    reverifyRequested: reverifyRequested === true,
                    reqAuth: req.auth,
                    neutralizationMeta,
                    persistOrReuseDiagnosis,
                    writeAudit,
                    writeVerification,
                    persist: shouldPersistDiagnosis,
                });

                if (!finalResult.ok) {
                    return res.status(500).json({ error: finalResult.error });
                }

                return res.json(finalResult.responsePayload);
            } catch (err) {
                logSafeError("AI_ANALYZE_FAILED", err, {
                    requestId: getRequestContext(req).requestId,
                    component: "ai_analyze",
                });
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
