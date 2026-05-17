import { AuthAuditLog } from "../../models/AuthAuditLog.js";
import { assertSuperAdmin, createAuthError } from "./shared.js";

const AUTH_LOG_COUNT_CACHE_TTL_MS = 30_000;
const authLogCountCache = new Map();

function buildAuthLogCountCacheKey({
    startDate,
    endDate,
    action,
    passwordEventsOnly = false,
}) {
    return JSON.stringify({
        startDate: startDate || null,
        endDate: endDate || null,
        action: action || null,
        passwordEventsOnly: passwordEventsOnly === true,
    });
}

function getCachedAuthLogCount(cacheKey) {
    const cached = authLogCountCache.get(cacheKey);
    if (!cached) {
        return null;
    }

    if (Date.now() - cached.cachedAt > AUTH_LOG_COUNT_CACHE_TTL_MS) {
        authLogCountCache.delete(cacheKey);
        return null;
    }

    return cached.total;
}

function setCachedAuthLogCount(cacheKey, total) {
    authLogCountCache.set(cacheKey, {
        total,
        cachedAt: Date.now(),
    });
}

function makeDateQuery({ startDate, endDate }) {
    if (!startDate && !endDate) {
        return null;
    }

    const dateQuery = {};

    if (startDate) {
        const parsedStart = new Date(`${startDate}T00:00:00.000`);
        if (Number.isNaN(parsedStart.getTime())) {
            throw createAuthError("INVALID_INPUT", "Date de debut invalide.");
        }
        dateQuery.$gte = parsedStart;
    }

    if (endDate) {
        const parsedEnd = new Date(`${endDate}T23:59:59.999`);
        if (Number.isNaN(parsedEnd.getTime())) {
            throw createAuthError("INVALID_INPUT", "Date de fin invalide.");
        }
        dateQuery.$lte = parsedEnd;
    }

    return dateQuery;
}

function makeAllowedActions() {
    return new Set([
        "LOGIN",
        "LOGOUT",
        "FAILED_LOGIN",
        "USER_MANAGEMENT",
        "PASSWORD_CHANGE",
    ]);
}

function makeActionClause(action) {
    if (!(typeof action === "string" && action.trim())) {
        return null;
    }

    const normalizedAction = action.trim().toUpperCase();
    if (!makeAllowedActions().has(normalizedAction)) {
        throw createAuthError("INVALID_INPUT", "Action invalide.");
    }

    return { action: normalizedAction };
}

function makeAuthAuditQuery({ startDate, endDate, action, passwordEventsOnly = false }) {
    const query = {};
    const andClauses = [];

    const dateQuery = makeDateQuery({ startDate, endDate });
    if (dateQuery) {
        andClauses.push({ timestamp: dateQuery });
    }

    const actionClause = makeActionClause(action);
    if (actionClause) {
        andClauses.push(actionClause);
    }

    const passwordEventsOnlyEnabled =
        passwordEventsOnly === true ||
        String(passwordEventsOnly).trim().toLowerCase() === "true";

    if (passwordEventsOnlyEnabled) {
        andClauses.push({
            $or: [
                { action: "PASSWORD_CHANGE" },
                {
                    action: "USER_MANAGEMENT",
                    reason: { $regex: /^RESET_PASSWORD:/ },
                },
            ],
        });
    }

    if (andClauses.length > 0) {
        query.$and = andClauses;
    }

    return { query, passwordEventsOnlyEnabled };
}

export async function listAuthLogs({
    authUser,
    page = 1,
    limit = 20,
    startDate,
    endDate,
    action,
    passwordEventsOnly = false,
}) {
    assertSuperAdmin(authUser);

    const parsedPage = Number(page);
    const parsedLimit = Number(limit);

    if (
        !Number.isFinite(parsedPage) ||
        parsedPage < 1 ||
        !Number.isFinite(parsedLimit) ||
        parsedLimit < 1 ||
        parsedLimit > 100
    ) {
        throw createAuthError("INVALID_INPUT", "Pagination invalide.");
    }

    const { query, passwordEventsOnlyEnabled } = makeAuthAuditQuery({
        startDate,
        endDate,
        action,
        passwordEventsOnly,
    });

    const skip = (parsedPage - 1) * parsedLimit;
    const cacheKey = buildAuthLogCountCacheKey({
        startDate,
        endDate,
        action,
        passwordEventsOnly: passwordEventsOnlyEnabled,
    });
    const cachedTotal = getCachedAuthLogCount(cacheKey);
    const totalPromise =
        cachedTotal !== null
            ? Promise.resolve(cachedTotal)
            : AuthAuditLog.countDocuments(query).then((total) => {
                setCachedAuthLogCount(cacheKey, total);
                return total;
            });

    const [total, logs] = await Promise.all([
        totalPromise,
        AuthAuditLog.find(query)
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(parsedLimit)
            .lean(),
    ]);

    return {
        logs: logs.map((log) => ({
            id: String(log._id),
            action: log.action,
            outcome: log.outcome,
            userId: log.userId ? String(log.userId) : null,
            usernameMasked: log.usernameMasked,
            actorUsername: log.actorUsername || null,
            targetUsername: log.targetUsername || null,
            role: log.role,
            ip: log.ip,
            reason: log.reason,
            timestamp: log.timestamp,
        })),
        pagination: {
            page: parsedPage,
            limit: parsedLimit,
            total,
            totalPages: Math.max(1, Math.ceil(total / parsedLimit)),
        },
    };
}

export async function listAuthLogGraphs({
    authUser,
    startDate,
    endDate,
    action,
}) {
    assertSuperAdmin(authUser);

    const { query } = makeAuthAuditQuery({
        startDate,
        endDate,
        action,
    });

    const rows = await AuthAuditLog.aggregate([
        { $match: query },
        {
            $group: {
                _id: {
                    date: {
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: "$timestamp",
                        },
                    },
                    action: "$action",
                },
                count: { $sum: 1 },
            },
        },
        { $sort: { "_id.date": 1, "_id.action": 1 } },
    ]);

    const preferredActionOrder = [
        "LOGIN",
        "LOGOUT",
        "FAILED_LOGIN",
        "USER_MANAGEMENT",
    ];

    const actionSet = new Set();
    const byDate = new Map();

    for (const row of rows) {
        const date = row?._id?.date;
        const actionName = row?._id?.action;
        const count = Number(row?.count || 0);

        if (!date || !actionName) {
            continue;
        }

        actionSet.add(actionName);

        if (!byDate.has(date)) {
            byDate.set(date, {
                date,
                total: 0,
            });
        }

        const current = byDate.get(date);
        current[actionName] = count;
        current.total += count;
    }

    const actions = preferredActionOrder.filter((name) => actionSet.has(name));
    const points = Array.from(byDate.values()).sort((a, b) =>
        String(a.date).localeCompare(String(b.date))
    );

    return {
        actions,
        points,
    };
}
