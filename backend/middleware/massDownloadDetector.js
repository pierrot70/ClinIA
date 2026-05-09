import { createSecurityIncident } from "../services/securityIncidents.js";

const DEFAULT_WINDOW_MS = 2 * 60 * 1000;
const DEFAULT_INCIDENT_COOLDOWN_MS = 10 * 60 * 1000;

const detectorState = new Map();

function getRequestIp(req) {
    const forwardedFor = req.headers?.["x-forwarded-for"];

    if (typeof forwardedFor === "string" && forwardedFor.trim()) {
        return forwardedFor.split(",")[0].trim();
    }

    return req.ip || "unknown";
}

function pruneExpiredEntries(now) {
    for (const [key, entry] of detectorState.entries()) {
        if (now - entry.windowStartedAt >= entry.windowMs) {
            detectorState.delete(key);
        }
    }
}

function buildActorKey(req, detectorKey) {
    const userId = req.auth?.userId || "anonymous";
    const ip = getRequestIp(req);
    return `${detectorKey}:${userId}:${ip}`;
}

function getNormalizedRequestedLimit(req, defaultLimit = 0, maxLimit = 100) {
    const requestedLimit = Number.parseInt(`${req.query?.limit ?? ""}`, 10);

    if (!Number.isFinite(requestedLimit) || requestedLimit < 1) {
        return defaultLimit;
    }

    return Math.min(requestedLimit, maxLimit);
}

export function createMassDownloadDetector({
    detectorKey,
    threshold,
    windowMs = DEFAULT_WINDOW_MS,
    incidentCooldownMs = DEFAULT_INCIDENT_COOLDOWN_MS,
    computeCost = () => 1,
    buildContext = () => ({}),
}) {
    if (!detectorKey || typeof detectorKey !== "string") {
        throw new Error("detectorKey est requis.");
    }

    if (!Number.isFinite(threshold) || threshold < 1) {
        throw new Error("threshold invalide.");
    }

    return async function massDownloadDetector(req, res, next) {
        const now = Date.now();
        pruneExpiredEntries(now);

        const actorKey = buildActorKey(req, detectorKey);
        const eventCost = Math.max(0, Number(computeCost(req)) || 0);

        let entry = detectorState.get(actorKey);
        if (!entry || now - entry.windowStartedAt >= windowMs) {
            entry = {
                windowStartedAt: now,
                totalCost: 0,
                incidentsCreated: 0,
                lastIncidentAt: 0,
                windowMs,
            };
            detectorState.set(actorKey, entry);
        }

        entry.totalCost += eventCost;

        if (
            eventCost > 0 &&
            entry.totalCost > threshold &&
            (entry.lastIncidentAt === 0 ||
                now - entry.lastIncidentAt >= incidentCooldownMs)
        ) {
            entry.lastIncidentAt = now;
            entry.incidentsCreated += 1;

            void createSecurityIncident({
                type: "MASS_DOWNLOAD_ATTEMPT",
                phase: "post_cloud",
                reason: "Comportement de consultation ou d'export volumetrique detecte.",
                requestPath: req.originalUrl || req.path || req.url || "/",
                context: {
                    detectorKey,
                    userId: req.auth?.userId ?? null,
                    username: req.auth?.username ?? null,
                    role: req.auth?.role ?? null,
                    ip: getRequestIp(req),
                    totalCost: entry.totalCost,
                    threshold,
                    eventCost,
                    windowMs,
                    incidentsCreated: entry.incidentsCreated,
                    ...buildContext(req),
                },
            }).catch((err) => {
                console.error("❌ MASS_DOWNLOAD_INCIDENT_CREATE_FAILED", err);
            });
        }

        return next();
    };
}

export function createPatientsMassDownloadDetector() {
    return createMassDownloadDetector({
        detectorKey: "patients_list",
        threshold: 200,
        windowMs: 2 * 60 * 1000,
        computeCost: (req) => {
            if ((req.method || "GET").toUpperCase() !== "GET") {
                return 0;
            }

            return getNormalizedRequestedLimit(req, 10, 50);
        },
        buildContext: (req) => ({
            requestedLimit: getNormalizedRequestedLimit(req, 10, 50),
            requestedPage: Number.parseInt(`${req.query?.page ?? ""}`, 10) || 1,
        }),
    });
}

export function createOpenAILogsExportMassDownloadDetector() {
    return createMassDownloadDetector({
        detectorKey: "openai_logs_export",
        threshold: 2,
        windowMs: 10 * 60 * 1000,
        incidentCooldownMs: 30 * 60 * 1000,
        computeCost: (req) => {
            const path = req.path || req.originalUrl || req.url || "";
            if ((req.method || "GET").toUpperCase() !== "GET") {
                return 0;
            }

            return path.includes("/export.csv") ? 1 : 0;
        },
        buildContext: () => ({
            exportType: "csv",
        }),
    });
}

export function resetMassDownloadDetectorForTests() {
    detectorState.clear();
}
