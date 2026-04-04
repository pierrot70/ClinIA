import { PatientAuditLog } from "../models/PatientAuditLog.js";

function redactUsername(username) {
    if (!username || typeof username !== "string") {
        return "unknown";
    }

    return username.trim().toLowerCase().slice(0, 2) + "***";
}

function normalizeChangedFields(changedFields = []) {
    if (!Array.isArray(changedFields)) {
        return [];
    }

    return Array.from(
        new Set(
            changedFields
                .filter((field) => typeof field === "string")
                .map((field) => field.trim())
                .filter(Boolean)
        )
    );
}

export async function recordPatientAuditEvent({
    action,
    outcome,
    actorUserId = null,
    actorUsername = null,
    actorRole = null,
    ip = null,
    patientId = null,
    changedFields = [],
    requestPath = null,
}) {
    try {
        await PatientAuditLog.create({
            action,
            outcome,
            actorUserId,
            actorUsernameMasked: redactUsername(actorUsername),
            actorRole,
            ip,
            patientId,
            changedFields: normalizeChangedFields(changedFields),
            requestPath,
            timestamp: new Date(),
        });
    } catch (err) {
        // Never block patient flows due to audit persistence issues.
        console.warn("⚠️ Patient audit write failed", err?.message);
    }
}