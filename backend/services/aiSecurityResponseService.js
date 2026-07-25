import { logSafeError } from "../utils/requestLogSafety.js";

export function createRespondWithSecurityIncident(deps) {
    const {
        createSecurityIncident,
        recordOpenAIRequestAuditEvent,
        buildBlockingIncidentResponse,
        makeSourceHash,
        logger = console,
    } = deps;

    return async function respondWithSecurityIncident({
        res,
        phase,
        reason,
        requestPath,
        matches,
        context = {},
        auditEvent = null,
        sanitizationPreview = null,
    }) {
        try {
            const incident = await createSecurityIncident({
                phase,
                reason,
                requestPath,
                matches,
                context,
                ...(auditEvent?.payloadHash
                    ? { payloadHash: auditEvent.payloadHash }
                    : {}),
                transport: "openai_chat_completions",
            });

            if (auditEvent && typeof auditEvent === "object") {
                const incidentErrorCode =
                    phase === "pre_cloud"
                        ? "PRE_CLOUD_IDENTIFIER_DETECTED"
                        : phase === "post_cloud"
                          ? "POST_CLOUD_IDENTIFIER_DETECTED"
                          : "SECURITY_IDENTIFIER_DETECTED";

                await recordOpenAIRequestAuditEvent({
                    action: "AI_ANALYZE_REQUEST",
                    outcome: "FAILED",
                    errorCode: incidentErrorCode,
                    actorUserId: auditEvent.actorUserId ?? null,
                    actorUsername: auditEvent.actorUsername ?? null,
                    actorRole: auditEvent.actorRole ?? null,
                    ip: auditEvent.ip ?? null,
                    requestPath,
                    model: auditEvent.model || "unknown",
                    payloadHash: auditEvent.payloadHash || makeSourceHash({
                        requestPath,
                        phase,
                        reason,
                    }),
                    payloadSizeBytes: auditEvent.payloadSizeBytes ?? 0,
                    requestContext: {
                        ...(auditEvent.requestContext || {}),
                        securityIncidentPhase: phase,
                        blockedBeforeCloud: phase === "pre_cloud",
                        detectedIdentifierCount: Array.isArray(matches)
                            ? matches.length
                            : 0,
                        detectedIdentifierTypes: Array.isArray(matches)
                            ? [...new Set(matches.map((match) => match?.type).filter(Boolean))]
                            : [],
                    },
                    acknowledgmentIncidentId: String(incident?._id || ""),
                    neutralized: false,
                });
            }

            return res
                .status(422)
                .json(buildBlockingIncidentResponse(incident, { sanitizationPreview }));
        } catch (err) {
            logSafeError("SECURITY_INCIDENT_PERSIST_FAILED", err, {
                logger,
                component: "security_incident",
            });

            return res.status(500).json({
                error: {
                    code: "SECURITY_INCIDENT_LOG_FAILED",
                    message:
                        "Contenu non securise detecte mais incident non enregistre. Workflow bloque: reessayez ou contactez l'administrateur.",
                    retryable: true,
                },
                blocking: {
                    required: true,
                    userMessage:
                        "L'incident de securite doit etre journalise avant de continuer.",
                },
            });
        }
    };
}
