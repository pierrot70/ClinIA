import express from "express";
import { requireRole } from "../middleware/requireRole.js";
import { AUTH_ROLES } from "../auth/constants.js";
import { exportOpenAILogsCsv, listOpenAILogs } from "../services/openaiLogs.js";
import { logSafeError } from "../utils/requestLogSafety.js";

const router = express.Router();

function getOpenAILogFilters(req) {
    return {
        page: req.query.page,
        limit: req.query.limit,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        action: req.query.action,
        outcome: req.query.outcome,
        actorUserId: req.query.actorUserId,
        actorUsernameMasked: req.query.actorUsernameMasked,
        actorRole: req.query.actorRole,
        ip: req.query.ip,
        requestPath: req.query.requestPath,
        transport: req.query.transport,
        model: req.query.model,
        payloadHash: req.query.payloadHash,
        payloadSizeBytes: req.query.payloadSizeBytes,
        dataClassification: req.query.dataClassification,
        acknowledgmentIncidentId: req.query.acknowledgmentIncidentId,
        neutralized: req.query.neutralized,
        upstreamRequestId: req.query.upstreamRequestId,
        errorCode: req.query.errorCode,
    };
}

router.get(
    "/export.csv",
    requireRole(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPERADMIN),
    async (req, res) => {
        try {
            const { csv, truncated } = await exportOpenAILogsCsv({
                authUser: req.auth,
                ...getOpenAILogFilters(req),
            });

            const exportedAt = new Date().toISOString().replace(/[:.]/g, "-");
            const fileName = `openai-logs-${exportedAt}.csv`;

            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${fileName}"`
            );

            if (truncated) {
                res.setHeader("X-Export-Truncated", "true");
            }

            return res.status(200).send(csv);
        } catch (err) {
            if (err.code === "FORBIDDEN") {
                return res.status(403).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            if (err.code === "INVALID_INPUT") {
                return res.status(400).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            logSafeError("OPENAI_AUDIT_EXPORT_FAILED", err);

            return res.status(500).json({
                error: {
                    code: "PERSISTENCE_FAILED",
                    message: "Impossible d'exporter les journaux OpenAI.",
                    retryable: true,
                },
            });
        }
    }
);

router.get(
    "/",
    requireRole(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPERADMIN),
    async (req, res) => {
        try {
            const data = await listOpenAILogs({
                authUser: req.auth,
                ...getOpenAILogFilters(req),
            });

            return res.status(200).json({
                data,
                meta: {
                    source: "real",
                    model: "mongo",
                },
            });
        } catch (err) {
            if (err.code === "FORBIDDEN") {
                return res.status(403).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            if (err.code === "INVALID_INPUT") {
                return res.status(400).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            logSafeError("OPENAI_AUDIT_LIST_FAILED", err);

            return res.status(500).json({
                error: {
                    code: "PERSISTENCE_FAILED",
                    message: "Impossible de recuperer les journaux OpenAI.",
                    retryable: true,
                },
            });
        }
    }
);

export default router;
