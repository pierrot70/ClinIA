import { AuthAuditLog } from "../models/AuthAuditLog.js";

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
            role,
            ip,
            reason,
            timestamp: new Date(),
        });
    } catch (err) {
        // Never block auth flows due to audit persistence issues.
        console.warn("⚠️ Auth audit write failed", err?.message);
    }
}
