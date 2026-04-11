import mongoose from "mongoose";
import { OpenAIRequestAuditLog } from "../models/OpenAIRequestAuditLog.js";

function redactUsername(username) {
    if (!username || typeof username !== "string") {
        return "unknown";
    }

    return username.trim().toLowerCase().slice(0, 2) + "***";
}

function normalizeRequestContext(context) {
    if (!context || typeof context !== "object") {
        return {};
    }

    return Object.fromEntries(
        Object.entries(context).filter(([, value]) => {
            if (value == null) {
                return false;
            }

            if (typeof value === "string") {
                return value.trim().length > 0;
            }

            if (typeof value === "number" || typeof value === "boolean") {
                return true;
            }

            if (Array.isArray(value)) {
                return value.length > 0;
            }

            return false;
        })
    );
}

export async function recordOpenAIRequestAuditEvent({
    action = "AI_ANALYZE_REQUEST",
    outcome = "SENT",
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
            requestContext: normalizeRequestContext(requestContext),
            acknowledgmentIncidentId:
                acknowledgmentIncidentId &&
                mongoose.Types.ObjectId.isValid(acknowledgmentIncidentId)
                    ? acknowledgmentIncidentId
                    : null,
            neutralized: neutralized === true,
            timestamp: new Date(),
        });

        return created;
    } catch (err) {
        console.warn("⚠️ OpenAI request audit write failed", err?.message);
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
        console.warn("⚠️ OpenAI request audit finalize failed", err?.message);
    }
}