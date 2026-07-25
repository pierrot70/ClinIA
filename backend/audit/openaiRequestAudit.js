import mongoose from "mongoose";
import { OpenAIRequestAuditLog } from "../models/OpenAIRequestAuditLog.js";
import { minimizeOpenAIRequestContext } from "./auditDataMinimization.js";
import { logSafeError } from "../utils/requestLogSafety.js";

function redactUsername(username) {
    if (!username || typeof username !== "string") {
        return "unknown";
    }

    return username.trim().toLowerCase().slice(0, 2) + "***";
}

export async function recordOpenAIRequestAuditEvent({
    action = "AI_ANALYZE_REQUEST",
    outcome = "SENT",
    errorCode = null,
    actorUserId = null,
    actorUsername = null,
    actorRole = null,
    ip = null,
    requestPath,
    model,
    payloadHash,
    payloadSizeBytes = 0,
    requestContext = {},
    acknowledgmentIncidentId = null,
    neutralized = false,
}) {
    try {
        const created = await OpenAIRequestAuditLog.create({
            action,
            outcome,
            actorUserId:
                actorUserId && mongoose.Types.ObjectId.isValid(actorUserId)
                    ? actorUserId
                    : null,
            actorUsernameMasked: redactUsername(actorUsername),
            actorRole,
            ip,
            requestPath,
            model,
            payloadHash,
            payloadSizeBytes,
            requestContext: minimizeOpenAIRequestContext(requestContext),
            acknowledgmentIncidentId:
                acknowledgmentIncidentId &&
                mongoose.Types.ObjectId.isValid(acknowledgmentIncidentId)
                    ? acknowledgmentIncidentId
                    : null,
            neutralized: neutralized === true,
            errorCode,
            timestamp: new Date(),
        });

        return created;
    } catch (err) {
        logSafeError("OPENAI_AUDIT_WRITE_FAILED", err);
        return null;
    }
}

export async function finalizeOpenAIRequestAuditEvent(
    auditId,
    {
        outcome,
        upstreamRequestId = null,
        errorCode = null,
    }
) {
    if (!auditId || !mongoose.Types.ObjectId.isValid(String(auditId))) {
        return;
    }

    try {
        await OpenAIRequestAuditLog.updateOne(
            { _id: String(auditId) },
            {
                $set: {
                    outcome,
                    upstreamRequestId,
                    errorCode,
                },
            }
        );
    } catch (err) {
        logSafeError("OPENAI_AUDIT_FINALIZE_FAILED", err);
    }
}
