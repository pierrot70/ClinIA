import express from "express";
import { requireRole } from "../middleware/requireRole.js";
import { AUTH_ROLES } from "../auth/constants.js";
import { listOpenAILogs } from "../services/openaiLogs.js";

const router = express.Router();

router.get(
    "/",
    requireRole(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPERADMIN),
    async (req, res) => {
        try {
            const data = await listOpenAILogs({
                authUser: req.auth,
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

            console.error("❌ OpenAI audit log list error:", err);

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