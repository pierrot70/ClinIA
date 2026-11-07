import mongoose from "mongoose";
import { WriteOperationAuditLog } from "../models/WriteOperationAuditLog.js";
import { AdminUser } from "../models/AdminUser.js";
import { Appointment } from "../models/Appointment.js";
import { Patient } from "../models/Patient.js";

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

function assertReceiptAccess(authUser) {
    if (!authUser?.userId || !authUser?.role || !["USER", "RECEPTION", "MEDECIN", "IPS", "ADMIN", "SUPERADMIN"].includes(authUser.role)) {
        throw createWriteAuditError("FORBIDDEN", "Authentification requise.");
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

// Explicit receipt bounds are browser-local day boundaries converted to UTC.
// No server timezone conversion or date normalization is accepted for these.
function parseReceiptUtcBoundary(value, label) {
    if (value === undefined) return null;
    if (typeof value !== "string") {
        throw createWriteAuditError("INVALID_INPUT", `${label} invalide.`);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
        throw createWriteAuditError("INVALID_INPUT", `${label} invalide.`);
    }
    return parsed;
}

function parseReceiptLegacyBoundary(value, label, endOfDay = false) {
    if (value === undefined || (typeof value === "string" && !value.trim())) return null;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
        throw createWriteAuditError("INVALID_INPUT", `${label} invalide.`);
    }
    const day = value.trim();
    const calendarDay = new Date(`${day}T00:00:00.000Z`);
    if (Number.isNaN(calendarDay.getTime()) || calendarDay.toISOString().slice(0, 10) !== day) {
        throw createWriteAuditError("INVALID_INPUT", `${label} invalide.`);
    }
    // Preserve old clients' server-local date interpretation and inclusive end.
    return parseDateFilter(day, label, endOfDay);
}

function receiptTimestampFilter({ startAt, endBefore, startDate, endDate }) {
    const start = startAt !== undefined
        ? parseReceiptUtcBoundary(startAt, "Borne UTC de debut")
        : parseReceiptLegacyBoundary(startDate, "Date de debut");
    const end = endBefore !== undefined
        ? parseReceiptUtcBoundary(endBefore, "Borne UTC de fin")
        : parseReceiptLegacyBoundary(endDate, "Date de fin", true);
    if (start && end && start.getTime() >= end.getTime()) {
        throw createWriteAuditError("INVALID_INPUT", "La borne de debut doit preceder la borne de fin.");
    }
    if (!start && !end) return null;
    return {
        ...(start ? { $gte: start } : {}),
        ...(end ? endBefore !== undefined ? { $lt: end } : { $lte: end } : {}),
    };
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

async function listReceptionReceiptPatientNames(logs, userId) {
    const receipts = logs.filter(log =>
        log.actorRole === "RECEPTION" && log.collectionName === "appointments" &&
        ["CREATE", "UPDATE"].includes(log.operation) &&
        mongoose.isObjectIdOrHexString(log.resourceId) && mongoose.isObjectIdOrHexString(log.patientId)
    );
    if (!receipts.length) return new Map();

    const reception = await AdminUser.findOne(
        { _id: userId, role: "RECEPTION", isActive: true }, { assignedClinics: 1 }
    ).lean();
    const assignedClinics = new Set((reception?.assignedClinics || []).map(String));
    if (!assignedClinics.size) return new Map();

    const appointments = await Appointment.find(
        { _id: { $in: [...new Set(receipts.map(log => log.resourceId))] } },
        { _id: 1, patient: 1, clinique: 1 }
    ).lean();
    const appointmentById = new Map(appointments.map(row => [String(row._id), row]));
    const authorized = receipts.filter(log => {
        const appointment = appointmentById.get(String(log.resourceId));
        // Older same-clinic receipts can use the booking clinic. New receipts
        // carry the actual origin, including when a nearer slot is found elsewhere.
        return appointment && String(appointment.patient) === String(log.patientId) &&
            assignedClinics.has(String(log.receptionClinicId ?? appointment.clinique));
    });
    if (!authorized.length) return new Map();

    const patients = await Patient.find(
        { _id: { $in: [...new Set(authorized.map(log => log.patientId))] }, archivedAt: null },
        { _id: 1, prenom: 1, nom: 1 }
    ).lean();
    const names = new Map(patients.map(patient => [
        String(patient._id), `${patient.prenom || ""} ${patient.nom || ""}`.trim(),
    ]));
    // Index by the actual receipt row, so another row for this patient does
    // not inherit the name without passing its own clinic and booking checks.
    return new Map(authorized.map(log => [log, names.get(String(log.patientId))]));
}

export async function listMyWriteReceipts({
    authUser,
    page,
    limit,
    startDate,
    endDate,
    startAt,
    endBefore,
    collectionName,
    operation,
    patientId,
}) {
    assertReceiptAccess(authUser);

    const parsedPage = Number.parseInt(page, 10) || 1;
    const parsedLimit = Number.parseInt(limit, 10) || DEFAULT_PAGE_LIMIT;
    if (parsedPage < 1 || parsedLimit < 1 || parsedLimit > MAX_PAGE_LIMIT) {
        throw createWriteAuditError("INVALID_INPUT", "Pagination invalide.");
    }

    const timestamp = receiptTimestampFilter({ startAt, endBefore, startDate, endDate });
    const query = buildWriteAuditQuery({
        collectionName,
        operation,
        outcome: "SUCCESS",
        actorUserId: String(authUser.userId),
        patientId,
    });
    query.$and = [
        ...(timestamp ? [{ timestamp }] : []),
        ...(query.$and || []),
        { verificationId: { $ne: null } },
        { collectionName: { $nin: ["patientauditlogs", "patientclinicalnoteversions"] } },
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

    const receiptPatientNames = authUser.role === "RECEPTION"
        ? await listReceptionReceiptPatientNames(logs, authUser.userId)
        : new Map();

    return {
        logs: logs.map((log) => {
            const row = normalizeAuditRow(log);
            const patientName = receiptPatientNames.get(log);
            return {
                verificationId: row.verificationId,
                collectionName: row.collectionName,
                operation: row.operation,
                resourceId: row.resourceId,
                patientId: row.patientId,
                ...(patientName ? { patientName } : {}),
                changedFields: row.changedFields,
                writeConcern: row.writeConcern,
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
