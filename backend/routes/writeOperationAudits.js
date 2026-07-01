import express from "express";
import { listWriteOperationAudits } from "../services/writeOperationAudits.js";

const router = express.Router();

function getFilters(req) {
    return {
        page: req.query.page,
        limit: req.query.limit,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        collectionName: req.query.collectionName,
        operation: req.query.operation,
        outcome: req.query.outcome,
        actorUserId: req.query.actorUserId,
        actorRole: req.query.actorRole,
        resourceId: req.query.resourceId,
        requestId: req.query.requestId,
        replicaStatus: req.query.replicaStatus,
        majorityAvailable: req.query.majorityAvailable,
    };
}

router.get("/", async (req, res) => {
    try {
        const data = await listWriteOperationAudits({
            authUser: req.auth,
            ...getFilters(req),
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

        console.error("Write operation audit list error:", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message: "Impossible de recuperer les audits d'ecriture.",
                retryable: true,
            },
        });
    }
});

export default router;
