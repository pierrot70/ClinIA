import crypto from "node:crypto";

export function generateWriteVerificationId() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(6).toString("hex").toUpperCase();
    return `WRV-${timestamp}-${random}`;
}

function normalizeClientMutationId(value) {
    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.trim();
    return normalized ? normalized.slice(0, 120) : null;
}

export function getClientMutationId(req) {
    return normalizeClientMutationId(req.headers?.["x-client-mutation-id"]) ||
        normalizeClientMutationId(req.body?.clientMutationId);
}

export function createWriteVerificationContext(req) {
    return {
        verificationId: generateWriteVerificationId(),
        clientMutationId: getClientMutationId(req),
    };
}

export function buildWriteVerificationMeta({
    writeAuditRecorded,
    verificationId,
    clientMutationId,
}) {
    return {
        status: writeAuditRecorded ? "CONFIRMED" : "UNAVAILABLE",
        verificationId: writeAuditRecorded ? verificationId : null,
        clientMutationId,
    };
}
