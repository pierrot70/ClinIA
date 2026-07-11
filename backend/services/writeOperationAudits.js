import mongoose from "mongoose";
import { WriteOperationAuditLog } from "../models/WriteOperationAuditLog.js";

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

function createWriteAuditError(code, message) {
    return { code, message };
}

function assertWriteAuditAccess(authUser) {
    if (!authUser?.role || !["ADMIN", "SUPERADMIN"].includes(authUser.role)) {
        throw createWriteAuditError(
            "FORBIDDEN",
            "Action reservee aux administrateurs."
        );
    }
}

function assertClinicianReceiptAccess(authUser) {
    if (!authUser?.userId || !authUser?.role || !["USER", "MEDECIN", "ADMIN", "SUPERADMIN"].includes(authUser.role)) {
        throw createWriteAuditError("FORBIDDEN", "Authentification clinique requise.");
    }
}

function parseDateFilter(value, label, endOfDay = false) {
    if (typeof value !== "string" || !value.trim()) {
        return null;
    }

    const suffix = endOfDay ? "T23:59:59.999" : "T00:00:00.000";
    const parsed = new Date(`${value.trim()}${suffix}`);
    if (Number.isNaN(parsed.getTime())) {
        throw createWriteAuditError("INVALID_INPUT", `${label} invalide.`);
    }

    return parsed;
}

function normalizeEnumFilter(value, allowedValues, label) {
    if (typeof value !== "string" || !value.trim()) {
        return null;
    }

    const normalized = value.trim().toUpperCase();
    if (!allowedValues.has(normalized)) {
        throw createWriteAuditError("INVALID_INPUT", `${label} invalide.`);
    }

    return normalized;
}

function normalizeStringFilter(value, maxLength = 120) {
    if (typeof value !== "string" || !value.trim()) {
        return null;
    }

    return value.trim().slice(0, maxLength);
}

function buildWriteAuditQuery({
    startDate,
    endDate,
    collectionName,
    operation,
    outcome,
    actorUserId,
    actorRole,
    resourceId,
    requestId,
    verificationId,
    clientMutationId,
    patientId,
    replicaStatus,
    majorityAvailable,
}) {
    const allowedOperations = new Set(["CREATE", "READ", "UPDATE", "DELETE", "REPLY", "UPSERT"]);
    const allowedOutcomes = new Set(["SUCCESS", "FAILED"]);
    const allowedRoles = new Set(["USER", "MEDECIN", "ADMIN", "SUPERADMIN"]);
    const allowedReplicaStatuses = new Set(["OK", "DEGRADED", "LAGGING", "INCIDENT", "UNKNOWN"]);

    const andClauses = [];

    const parsedStartDate = parseDateFilter(startDate, "Date de debut");
    const parsedEndDate = parseDateFilter(endDate, "Date de fin", true);
    if (parsedStartDate || parsedEndDate) {
        const timestamp = {};
        if (parsedStartDate) timestamp.$gte = parsedStartDate;
        if (parsedEndDate) timestamp.$lte = parsedEndDate;
        andClauses.push({ timestamp });
    }

    const normalizedCollectionName = normalizeStringFilter(collectionName, 80);
    if (normalizedCollectionName) {
        andClauses.push({ collectionName: normalizedCollectionName });
    }

    const normalizedOperation = normalizeEnumFilter(operation, allowedOperations, "Operation");
    if (normalizedOperation) {
        andClauses.push({ operation: normalizedOperation });
    }

    const normalizedOutcome = normalizeEnumFilter(outcome, allowedOutcomes, "Resultat");
    if (normalizedOutcome) {
        andClauses.push({ outcome: normalizedOutcome });
    }

    const normalizedActorUserId = normalizeStringFilter(actorUserId, 120);
    if (normalizedActorUserId) {
        if (!mongoose.Types.ObjectId.isValid(normalizedActorUserId)) {
            throw createWriteAuditError(
                "INVALID_INPUT",
                "Identifiant utilisateur invalide."
            );
        }
        andClauses.push({ actorUserId: normalizedActorUserId });
    }

    const normalizedActorRole = normalizeEnumFilter(actorRole, allowedRoles, "Role");
    if (normalizedActorRole) {
        andClauses.push({ actorRole: normalizedActorRole });
    }

    const normalizedResourceId = normalizeStringFilter(resourceId, 120);
    if (normalizedResourceId) {
        andClauses.push({ resourceId: normalizedResourceId });
    }

    const normalizedRequestId = normalizeStringFilter(requestId, 120);
    if (normalizedRequestId) {
        andClauses.push({ requestId: normalizedRequestId });
    }

    const normalizedVerificationId = normalizeStringFilter(verificationId, 120);
    if (normalizedVerificationId) {
        andClauses.push({ verificationId: normalizedVerificationId });
    }

    const normalizedClientMutationId = normalizeStringFilter(clientMutationId, 120);
    if (normalizedClientMutationId) {
        andClauses.push({ clientMutationId: normalizedClientMutationId });
    }

    const normalizedPatientId = normalizeStringFilter(patientId, 120);
    if (normalizedPatientId) {
        if (!mongoose.Types.ObjectId.isValid(normalizedPatientId)) {
            throw createWriteAuditError("INVALID_INPUT", "Identifiant patient invalide.");
        }
        andClauses.push({ patientId: normalizedPatientId });
    }

    const normalizedReplicaStatus = normalizeEnumFilter(
        replicaStatus,
        allowedReplicaStatuses,
        "Etat replica"
    );
    if (normalizedReplicaStatus) {
        andClauses.push({ "replicaSet.status": normalizedReplicaStatus });
    }

    if (typeof majorityAvailable === "string" && majorityAvailable.trim()) {
        const normalizedMajorityAvailable = majorityAvailable.trim().toLowerCase();
        if (!["true", "false"].includes(normalizedMajorityAvailable)) {
            throw createWriteAuditError("INVALID_INPUT", "Majorite invalide.");
        }
        andClauses.push({ "replicaSet.majorityAvailable": normalizedMajorityAvailable === "true" });
    }

    return andClauses.length ? { $and: andClauses } : {};
}

function normalizeAuditRow(log) {
    return {
        id: String(log._id),
        collectionName: log.collectionName,
        operation: log.operation,
        outcome: log.outcome,
        verificationId: log.verificationId || null,
        clientMutationId: log.clientMutationId || null,
        patientId: log.patientId || null,
        actorUserId: log.actorUserId ? String(log.actorUserId) : null,
        actorUsernameMasked: log.actorUsernameMasked,
        actorRole: log.actorRole,
        ip: log.ip,
        requestId: log.requestId,
        instanceId: log.instanceId,
        resourceId: log.resourceId,
        changedFields: Array.isArray(log.changedFields) ? log.changedFields : [],
        requestPath: log.requestPath,
        writeConcern: log.writeConcern || null,
        replicaSet: log.replicaSet || null,
        dataClassification: log.dataClassification,
        errorCode: log.errorCode,
        timestamp: log.timestamp,
    };
}

function countBy(rows, key) {
    return rows.reduce((acc, row) => {
        const value = key(row) || "UNKNOWN";
        acc[value] = (acc[value] || 0) + 1;
        return acc;
    }, {});
}

export async function listWriteOperationAudits({
    authUser,
    page,
    limit,
    startDate,
    endDate,
    collectionName,
    operation,
    outcome,
    actorUserId,
    actorRole,
    resourceId,
    requestId,
    verificationId,
    clientMutationId,
    patientId,
    replicaStatus,
    majorityAvailable,
}) {
    assertWriteAuditAccess(authUser);

    const parsedPage = Number.parseInt(page, 10) || 1;
    const parsedLimit = Number.parseInt(limit, 10) || DEFAULT_PAGE_LIMIT;
    if (parsedPage < 1 || parsedLimit < 1 || parsedLimit > MAX_PAGE_LIMIT) {
        throw createWriteAuditError("INVALID_INPUT", "Pagination invalide.");
    }

    const query = buildWriteAuditQuery({
        startDate,
        endDate,
        collectionName,
        operation,
        outcome,
        actorUserId,
        actorRole,
        resourceId,
        requestId,
        verificationId,
        clientMutationId,
        patientId,
        replicaStatus,
        majorityAvailable,
    });

    const skip = (parsedPage - 1) * parsedLimit;

    const [total, logs, summaryRows] = await Promise.all([
        WriteOperationAuditLog.countDocuments(query),
        WriteOperationAuditLog.find(query)
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(parsedLimit)
            .lean(),
        WriteOperationAuditLog.find(query, {
            collectionName: 1,
            operation: 1,
            outcome: 1,
            actorRole: 1,
            "replicaSet.status": 1,
            "replicaSet.majorityAvailable": 1,
        }).lean(),
    ]);

    return {
        summary: {
            total,
            byCollection: countBy(summaryRows, (row) => row.collectionName),
            byOperation: countBy(summaryRows, (row) => row.operation),
            byOutcome: countBy(summaryRows, (row) => row.outcome),
            byActorRole: countBy(summaryRows, (row) => row.actorRole),
            byReplicaStatus: countBy(summaryRows, (row) => row.replicaSet?.status),
            majorityUnavailableCount: summaryRows.filter(
                (row) => row.replicaSet?.majorityAvailable === false
            ).length,
        },
        logs: logs.map(normalizeAuditRow),
        pagination: {
            page: parsedPage,
            limit: parsedLimit,
            total,
            totalPages: Math.max(1, Math.ceil(total / parsedLimit)),
        },
    };
}

export async function listMyWriteReceipts({
    authUser,
    page,
    limit,
    startDate,
    endDate,
    collectionName,
    operation,
    patientId,
}) {
    assertClinicianReceiptAccess(authUser);

    const parsedPage = Number.parseInt(page, 10) || 1;
    const parsedLimit = Number.parseInt(limit, 10) || DEFAULT_PAGE_LIMIT;
    if (parsedPage < 1 || parsedLimit < 1 || parsedLimit > MAX_PAGE_LIMIT) {
        throw createWriteAuditError("INVALID_INPUT", "Pagination invalide.");
    }

    const query = buildWriteAuditQuery({
        startDate,
        endDate,
        collectionName,
        operation,
        outcome: "SUCCESS",
        actorUserId: String(authUser.userId),
        patientId,
    });
    query.$and = [
        ...(query.$and || []),
        { verificationId: { $ne: null } },
        { collectionName: { $ne: "patientauditlogs" } },
    ];

    const skip = (parsedPage - 1) * parsedLimit;
    const [total, logs] = await Promise.all([
        WriteOperationAuditLog.countDocuments(query),
        WriteOperationAuditLog.find(query)
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(parsedLimit)
            .lean(),
    ]);

    return {
        logs: logs.map((log) => {
            const row = normalizeAuditRow(log);
            return {
                verificationId: row.verificationId,
                collectionName: row.collectionName,
                operation: row.operation,
                resourceId: row.resourceId,
                patientId: row.patientId,
                changedFields: row.changedFields,
                replicaSet: row.replicaSet,
                timestamp: row.timestamp,
            };
        }),
        pagination: {
            page: parsedPage,
            limit: parsedLimit,
            total,
            totalPages: Math.max(1, Math.ceil(total / parsedLimit)),
        },
    };
}
