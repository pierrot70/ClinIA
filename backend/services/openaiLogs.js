import mongoose from "mongoose";
import { OpenAIRequestAuditLog } from "../models/OpenAIRequestAuditLog.js";

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;
const MAX_EXPORT_ROWS = 10000;

function createOpenAILogError(code, message) {
    return { code, message };
}

function assertOpenAILogAccess(authUser) {
    if (!authUser?.role || !["ADMIN", "SUPERADMIN"].includes(authUser.role)) {
        throw createOpenAILogError(
            "FORBIDDEN",
            "Action reservee aux administrateurs."
        );
    }
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildContainsRegex(value) {
    return new RegExp(escapeRegex(value.trim()), "i");
}

function normalizeOpenAILog(log) {
    return {
        id: String(log._id),
        action: log.action,
        outcome: log.outcome,
        actorUserId: log.actorUserId ? String(log.actorUserId) : null,
        actorUsernameMasked: log.actorUsernameMasked,
        actorRole: log.actorRole,
        ip: log.ip,
        requestPath: log.requestPath,
        transport: log.transport,
        model: log.model,
        payloadHash: log.payloadHash,
        payloadSizeBytes: Number(log.payloadSizeBytes || 0),
        dataClassification: log.dataClassification,
        acknowledgmentIncidentId: log.acknowledgmentIncidentId
            ? String(log.acknowledgmentIncidentId)
            : null,
        neutralized: log.neutralized === true,
        upstreamRequestId: log.upstreamRequestId,
        errorCode: log.errorCode,
        requestContext:
            log.requestContext && typeof log.requestContext === "object"
                ? log.requestContext
                : null,
        timestamp: log.timestamp,
    };
}

function buildOpenAILogsQuery({
    startDate,
    endDate,
    action,
    outcome,
    actorUserId,
    actorUsernameMasked,
    actorRole,
    ip,
    requestPath,
    transport,
    model,
    payloadHash,
    payloadSizeBytes,
    dataClassification,
    acknowledgmentIncidentId,
    neutralized,
    upstreamRequestId,
    errorCode,
}) {
    const allowedActions = new Set(["AI_ANALYZE_REQUEST"]);
    const allowedOutcomes = new Set(["SENT", "SUCCESS", "FAILED"]);
    const allowedRoles = new Set(["USER", "MEDECIN", "ADMIN", "SUPERADMIN"]);
    const allowedDataClassifications = new Set(["ANONYMIZED_MEDICAL"]);

    const query = {};
    const andClauses = [];

    if (startDate || endDate) {
        const dateQuery = {};

        if (startDate) {
            const parsedStart = new Date(`${startDate}T00:00:00.000`);
            if (Number.isNaN(parsedStart.getTime())) {
                throw createOpenAILogError(
                    "INVALID_INPUT",
                    "Date de debut invalide."
                );
            }
            dateQuery.$gte = parsedStart;
        }

        if (endDate) {
            const parsedEnd = new Date(`${endDate}T23:59:59.999`);
            if (Number.isNaN(parsedEnd.getTime())) {
                throw createOpenAILogError(
                    "INVALID_INPUT",
                    "Date de fin invalide."
                );
            }
            dateQuery.$lte = parsedEnd;
        }

        andClauses.push({ timestamp: dateQuery });
    }

    if (typeof action === "string" && action.trim()) {
        const normalizedAction = action.trim().toUpperCase();
        if (!allowedActions.has(normalizedAction)) {
            throw createOpenAILogError("INVALID_INPUT", "Action invalide.");
        }
        andClauses.push({ action: normalizedAction });
    }

    if (typeof outcome === "string" && outcome.trim()) {
        const normalizedOutcome = outcome.trim().toUpperCase();
        if (!allowedOutcomes.has(normalizedOutcome)) {
            throw createOpenAILogError("INVALID_INPUT", "Resultat invalide.");
        }
        andClauses.push({ outcome: normalizedOutcome });
    }

    if (typeof actorUserId === "string" && actorUserId.trim()) {
        const normalizedActorUserId = actorUserId.trim();
        if (!mongoose.Types.ObjectId.isValid(normalizedActorUserId)) {
            throw createOpenAILogError(
                "INVALID_INPUT",
                "Identifiant utilisateur invalide."
            );
        }
        andClauses.push({ actorUserId: normalizedActorUserId });
    }

    if (typeof actorUsernameMasked === "string" && actorUsernameMasked.trim()) {
        andClauses.push({
            actorUsernameMasked: buildContainsRegex(actorUsernameMasked),
        });
    }

    if (typeof actorRole === "string" && actorRole.trim()) {
        const normalizedActorRole = actorRole.trim().toUpperCase();
        if (!allowedRoles.has(normalizedActorRole)) {
            throw createOpenAILogError("INVALID_INPUT", "Role invalide.");
        }
        andClauses.push({ actorRole: normalizedActorRole });
    }

    if (typeof ip === "string" && ip.trim()) {
        andClauses.push({ ip: buildContainsRegex(ip) });
    }

    if (typeof requestPath === "string" && requestPath.trim()) {
        andClauses.push({ requestPath: buildContainsRegex(requestPath) });
    }

    if (typeof transport === "string" && transport.trim()) {
        andClauses.push({ transport: buildContainsRegex(transport) });
    }

    if (typeof model === "string" && model.trim()) {
        andClauses.push({ model: buildContainsRegex(model) });
    }

    if (typeof payloadHash === "string" && payloadHash.trim()) {
        andClauses.push({ payloadHash: buildContainsRegex(payloadHash) });
    }

    if (
        payloadSizeBytes !== undefined &&
        payloadSizeBytes !== null &&
        `${payloadSizeBytes}`.trim()
    ) {
        const parsedPayloadSizeBytes = Number.parseInt(`${payloadSizeBytes}`, 10);
        if (!Number.isFinite(parsedPayloadSizeBytes) || parsedPayloadSizeBytes < 0) {
            throw createOpenAILogError(
                "INVALID_INPUT",
                "Taille de payload invalide."
            );
        }
        andClauses.push({ payloadSizeBytes: parsedPayloadSizeBytes });
    }

    if (typeof dataClassification === "string" && dataClassification.trim()) {
        const normalizedDataClassification = dataClassification.trim().toUpperCase();
        if (!allowedDataClassifications.has(normalizedDataClassification)) {
            throw createOpenAILogError(
                "INVALID_INPUT",
                "Classification invalide."
            );
        }
        andClauses.push({ dataClassification: normalizedDataClassification });
    }

    if (
        typeof acknowledgmentIncidentId === "string" &&
        acknowledgmentIncidentId.trim()
    ) {
        const normalizedIncidentId = acknowledgmentIncidentId.trim();
        if (!mongoose.Types.ObjectId.isValid(normalizedIncidentId)) {
            throw createOpenAILogError(
                "INVALID_INPUT",
                "Identifiant incident invalide."
            );
        }
        andClauses.push({ acknowledgmentIncidentId: normalizedIncidentId });
    }

    if (typeof neutralized === "string" && neutralized.trim()) {
        const normalizedNeutralized = neutralized.trim().toLowerCase();
        if (!["true", "false"].includes(normalizedNeutralized)) {
            throw createOpenAILogError(
                "INVALID_INPUT",
                "Valeur neutralized invalide."
            );
        }
        andClauses.push({ neutralized: normalizedNeutralized === "true" });
    }

    if (typeof upstreamRequestId === "string" && upstreamRequestId.trim()) {
        andClauses.push({ upstreamRequestId: buildContainsRegex(upstreamRequestId) });
    }

    if (typeof errorCode === "string" && errorCode.trim()) {
        andClauses.push({ errorCode: buildContainsRegex(errorCode) });
    }

    if (andClauses.length > 0) {
        query.$and = andClauses;
    }

    return query;
}

function escapeCsvValue(value) {
    if (value == null) {
        return "";
    }

    const normalized = String(value);
    if (
        normalized.includes(",") ||
        normalized.includes("\n") ||
        normalized.includes("\r") ||
        normalized.includes('"')
    ) {
        return `"${normalized.replace(/"/g, '""')}"`;
    }

    return normalized;
}

function toCsvRow(values) {
    return values.map((value) => escapeCsvValue(value)).join(",");
}

export function serializeOpenAILogsCsv(logs) {
    const header = [
        "timestamp",
        "action",
        "outcome",
        "actorUserId",
        "actorUsernameMasked",
        "actorRole",
        "ip",
        "requestPath",
        "transport",
        "model",
        "payloadHash",
        "payloadSizeBytes",
        "dataClassification",
        "acknowledgmentIncidentId",
        "neutralized",
        "upstreamRequestId",
        "errorCode",
        "requestContext",
    ];

    const rows = logs.map((log) =>
        toCsvRow([
            log.timestamp instanceof Date ? log.timestamp.toISOString() : log.timestamp,
            log.action,
            log.outcome,
            log.actorUserId,
            log.actorUsernameMasked,
            log.actorRole,
            log.ip,
            log.requestPath,
            log.transport,
            log.model,
            log.payloadHash,
            log.payloadSizeBytes,
            log.dataClassification,
            log.acknowledgmentIncidentId,
            log.neutralized,
            log.upstreamRequestId,
            log.errorCode,
            log.requestContext ? JSON.stringify(log.requestContext) : "",
        ])
    );

    return [toCsvRow(header), ...rows].join("\n");
}

export async function listOpenAILogs({
    authUser,
    page,
    limit,
    startDate,
    endDate,
    action,
    outcome,
    actorUserId,
    actorUsernameMasked,
    actorRole,
    ip,
    requestPath,
    transport,
    model,
    payloadHash,
    payloadSizeBytes,
    dataClassification,
    acknowledgmentIncidentId,
    neutralized,
    upstreamRequestId,
    errorCode,
}) {
    assertOpenAILogAccess(authUser);

    const parsedPage = Number.parseInt(page, 10) || 1;
    const parsedLimit = Number.parseInt(limit, 10) || DEFAULT_PAGE_LIMIT;

    if (parsedPage < 1 || parsedLimit < 1 || parsedLimit > MAX_PAGE_LIMIT) {
        throw createOpenAILogError("INVALID_INPUT", "Pagination invalide.");
    }
    const query = buildOpenAILogsQuery({
        startDate,
        endDate,
        action,
        outcome,
        actorUserId,
        actorUsernameMasked,
        actorRole,
        ip,
        requestPath,
        transport,
        model,
        payloadHash,
        payloadSizeBytes,
        dataClassification,
        acknowledgmentIncidentId,
        neutralized,
        upstreamRequestId,
        errorCode,
    });

    const skip = (parsedPage - 1) * parsedLimit;

    const [total, logs] = await Promise.all([
        OpenAIRequestAuditLog.countDocuments(query),
        OpenAIRequestAuditLog.find(query)
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(parsedLimit)
            .lean(),
    ]);

    return {
        logs: logs.map((log) => normalizeOpenAILog(log)),
        pagination: {
            page: parsedPage,
            limit: parsedLimit,
            total,
            totalPages: Math.max(1, Math.ceil(total / parsedLimit)),
        },
    };
}

export async function exportOpenAILogsCsv({ authUser, ...filters }) {
    assertOpenAILogAccess(authUser);

    const query = buildOpenAILogsQuery(filters);
    const logs = await OpenAIRequestAuditLog.find(query)
        .sort({ timestamp: -1 })
        .limit(MAX_EXPORT_ROWS)
        .lean();

    const normalizedLogs = logs.map((log) => normalizeOpenAILog(log));

    return {
        csv: serializeOpenAILogsCsv(normalizedLogs),
        count: normalizedLogs.length,
        truncated: logs.length >= MAX_EXPORT_ROWS,
    };
}