import { AuthAuditLog } from "../models/AuthAuditLog.js";
import { logSafeError } from "../utils/requestLogSafety.js";

function redactUsername(username) {
    if (!username || typeof username !== "string") {
        return "unknown";
    }

    return username.trim().toLowerCase().slice(0, 2) + "***";
}

export async function recordAuthAuditEvent({
    action,
    outcome,
    userId = null,
    username = null,
    actorUsername = null,
    targetUsername = null,
    role = null,
    ip = null,
    reason = null,
}) {
    try {
        await AuthAuditLog.create({
            action,
            outcome,
            userId,
            usernameMasked: redactUsername(username),
            actorUsername:
                typeof actorUsername === "string" && actorUsername.trim()
                    ? actorUsername.trim().toLowerCase()
                    : null,
            targetUsername:
                typeof targetUsername === "string" && targetUsername.trim()
                    ? targetUsername.trim().toLowerCase()
                    : null,
            role,
            ip,
            reason,
            timestamp: new Date(),
        });
    } catch (err) {
        // Never block auth flows due to audit persistence issues.
        logSafeError("AUTH_AUDIT_WRITE_FAILED", err);
    }
}
