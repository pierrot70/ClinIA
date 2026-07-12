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

function normalizeAuditContext(context) {
    if (!context || typeof context !== "object") {
        return null;
    }

    const secureRequest =
        context.secureRequest && typeof context.secureRequest === "object"
            ? context.secureRequest
            : null;

    if (!secureRequest) {
        return null;
    }

    const selectedDocumentIds = Array.isArray(secureRequest.selectedDocumentIds)
        ? Array.from(
            new Set(
                secureRequest.selectedDocumentIds
                    .map((entry) =>
                        typeof entry === "string" ? entry.trim() : ""
                    )
                    .filter(Boolean)
            )
        )
        : [];

    const normalized = {
        secureRequest: {
            objective:
                typeof secureRequest.objective === "string"
                    ? secureRequest.objective.trim()
                    : "",
            clinicalScope:
                typeof secureRequest.clinicalScope === "string"
                    ? secureRequest.clinicalScope.trim()
                    : "",
            selectedDocumentIds,
            selectedDocumentCount: selectedDocumentIds.length,
        },
    };

    const hasUsefulContext = Object.values(normalized.secureRequest).some(
        (value) =>
            (typeof value === "string" && value.length > 0) ||
            (Array.isArray(value) && value.length > 0) ||
            (typeof value === "number" && value > 0)
    );

    return hasUsefulContext ? normalized : null;
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
    context = null,
    session = null,
    throwOnError = false,
}) {
    try {
        const document = {
            action,
            outcome,
            actorUserId,
            actorUsernameMasked: redactUsername(actorUsername),
            actorRole,
            ip,
            patientId,
            changedFields: normalizeChangedFields(changedFields),
            requestPath,
            context: normalizeAuditContext(context),
            timestamp: new Date(),
        };

        if (session) {
            const [created] = await PatientAuditLog.create([document], { session });
            return created;
        }

        return await PatientAuditLog.create(document);
    } catch (err) {
        if (throwOnError) {
            throw err;
        }
        // Never block patient flows due to audit persistence issues.
        console.warn("⚠️ Patient audit write failed", err?.message);
        return null;
    }
}
