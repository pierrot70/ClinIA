import { WriteOperationAuditLog } from "../models/WriteOperationAuditLog.js";

function redactUsername(username) {
    if (!username || typeof username !== "string") {
        return "unknown";
    }

    return username.trim().toLowerCase().slice(0, 2) + "***";
}

function normalizeString(value, maxLength = 120) {
    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.trim();
    if (!normalized) {
        return null;
    }

    return normalized.slice(0, maxLength);
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
    ).sort();
}

function normalizeWriteConcern(writeConcern = null) {
    if (!writeConcern || typeof writeConcern !== "object") {
        return {
            w: null,
            j: null,
            wtimeout: null,
        };
    }

    return {
        w: writeConcern.w ?? null,
        j:
            typeof writeConcern.j === "boolean"
                ? writeConcern.j
                : null,
        wtimeout:
            typeof writeConcern.wtimeout === "number"
                ? writeConcern.wtimeout
                : null,
    };
}

function normalizeReplicaSet(replicaSet = null) {
    if (!replicaSet || typeof replicaSet !== "object") {
        return null;
    }

    const summary =
        replicaSet.summary && typeof replicaSet.summary === "object"
            ? replicaSet.summary
            : replicaSet;

    const status =
        typeof summary.status === "string" && summary.status.trim()
            ? summary.status.trim().toUpperCase()
            : "UNKNOWN";

    return {
        status,
        memberCount:
            typeof summary.memberCount === "number"
                ? summary.memberCount
                : null,
        healthyCount:
            typeof summary.healthyCount === "number"
                ? summary.healthyCount
                : null,
        primaryCount:
            typeof summary.primaryCount === "number"
                ? summary.primaryCount
                : null,
        secondaryCount:
            typeof summary.secondaryCount === "number"
                ? summary.secondaryCount
                : null,
        majorityAvailable:
            typeof summary.majorityAvailable === "boolean"
                ? summary.majorityAvailable
                : null,
        maxLagSeconds:
            typeof summary.maxLagSeconds === "number"
                ? summary.maxLagSeconds
                : null,
        laggingThresholdSeconds:
            typeof summary.laggingThresholdSeconds === "number"
                ? summary.laggingThresholdSeconds
                : null,
        checkedAt: new Date(),
    };
}

export async function recordWriteOperationAuditEvent({
    collectionName,
    operation,
    outcome,
    verificationId = null,
    clientMutationId = null,
    actorUserId = null,
    actorUsername = null,
    actorRole = null,
    ip = null,
    requestId = null,
    instanceId = null,
    resourceId = null,
    changedFields = [],
    requestPath = null,
    writeConcern = null,
    replicaSet = null,
    errorCode = null,
}) {
    try {
        await WriteOperationAuditLog.create({
            collectionName: normalizeString(collectionName, 80),
            operation,
            outcome,
            verificationId: normalizeString(verificationId, 120),
            clientMutationId: normalizeString(clientMutationId, 120),
            actorUserId,
            actorUsernameMasked: redactUsername(actorUsername),
            actorRole,
            ip,
            requestId: normalizeString(requestId, 120),
            instanceId: normalizeString(instanceId, 120),
            resourceId: normalizeString(resourceId, 120),
            changedFields: normalizeChangedFields(changedFields),
            requestPath: normalizeString(requestPath, 240),
            writeConcern: normalizeWriteConcern(writeConcern),
            replicaSet: normalizeReplicaSet(replicaSet),
            dataClassification: "NO_PATIENT_IDENTIFIERS",
            errorCode: normalizeString(errorCode, 120),
            timestamp: new Date(),
        });
        return true;
    } catch (err) {
        // Audit must never block clinical workflows.
        console.warn("Write operation audit failed", err?.message);
        return false;
    }
}
