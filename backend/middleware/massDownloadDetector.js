import {
    createSecurityIncident,
    handleMassDownloadSignal,
} from "../services/securityIncidents.js";
import { MassDownloadWindow } from "../models/MassDownloadWindow.js";
import { getSafeRequestPath, logSafeError } from "../utils/requestLogSafety.js";
import { getTrustedRequestIp } from "../utils/requestIp.js";

const DEFAULT_WINDOW_MS = 2 * 60 * 1000;
const DEFAULT_INCIDENT_COOLDOWN_MS = 10 * 60 * 1000;

function buildActorKey(req, detectorKey) {
    const ip = getTrustedRequestIp(req);
    const userId = req.auth?.userId;

    if (userId) {
        return `${detectorKey}:${userId}`;
    }

    return `${detectorKey}:${ip}`;
}

function getWindowStartedAt(now, windowMs) {
    return new Date(Math.floor(now / windowMs) * windowMs);
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

        const actorKey = buildActorKey(req, detectorKey);
        const ip = getTrustedRequestIp(req);
        const eventCost = Math.max(0, Number(computeCost(req)) || 0);
        const windowStartedAt = getWindowStartedAt(now, windowMs);
        const expiresAt = new Date(windowStartedAt.getTime() + windowMs + incidentCooldownMs);

        if (eventCost === 0) {
            return next();
        }

        const entry = await MassDownloadWindow.findOneAndUpdate(
            {
                detectorKey,
                actorKey,
                windowStartedAt,
            },
            {
                $setOnInsert: {
                    detectorKey,
                    actorKey,
                    userId: req.auth?.userId || "anonymous",
                    username: req.auth?.username ?? null,
                    role: req.auth?.role ?? null,
                    ip,
                    windowStartedAt,
                    windowMs,
                    expiresAt,
                },
                $inc: {
                    totalCost: eventCost,
                },
            },
            {
                upsert: true,
                new: true,
            }
        );

        if (entry.totalCost > threshold) {
            const shouldCreateVisibleIncident = await shouldRecordIncident({
                entry,
                incidentCooldownMs,
                now,
            });

            if (shouldCreateVisibleIncident) {
                await createSecurityIncident({
                    type: "MASS_DOWNLOAD_ATTEMPT",
                    phase: "post_cloud",
                    reason: "Comportement de consultation ou d'export volumetrique detecte.",
                    requestPath: getSafeRequestPath(req, "/"),
                    context: {
                        detectorKey,
                        userId: req.auth?.userId ?? null,
                        username: req.auth?.username ?? null,
                        role: req.auth?.role ?? null,
                        ip,
                        totalCost: entry.totalCost,
                        threshold,
                        eventCost,
                        windowMs,
                        incidentsCreated: (entry.incidentsCreated || 0) + 1,
                        ...buildContext(req),
                    },
                }).catch((err) => {
                    logSafeError("MASS_DOWNLOAD_INCIDENT_CREATE_FAILED", err);
                });
            } else {
                await handleMassDownloadSignal({
                    userId: req.auth?.userId ?? null,
                    detectedAt: new Date(now),
                    additionalSignals: 1,
                }).catch((err) => {
                    logSafeError("MASS_DOWNLOAD_ESCALATION_SIGNAL_FAILED", err);
                });
            }
        }

        return next();
    };
}

async function shouldRecordIncident({ entry, incidentCooldownMs, now }) {
    const cooldownCutoff = new Date(now - incidentCooldownMs);
    const result = await MassDownloadWindow.updateOne(
        {
            _id: entry._id,
            $or: [
                { lastIncidentAt: null },
                { lastIncidentAt: { $lte: cooldownCutoff } },
            ],
        },
        {
            $set: {
                lastIncidentAt: new Date(now),
            },
            $inc: {
                incidentsCreated: 1,
            },
        }
    );

    return Boolean(result?.modifiedCount);
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
    return undefined;
}
