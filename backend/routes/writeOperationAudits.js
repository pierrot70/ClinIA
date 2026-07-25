import express from "express";
import {
    listMyWriteReceipts,
    listWriteOperationAudits,
} from "../services/writeOperationAudits.js";
import { logSafeError } from "../utils/requestLogSafety.js";

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
        verificationId: req.query.verificationId,
        clientMutationId: req.query.clientMutationId,
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

        logSafeError("WRITE_AUDIT_LIST_FAILED", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message: "Impossible de recuperer les audits d'ecriture.",
                retryable: true,
            },
        });
    }
});

router.get("/my-receipts", async (req, res) => {
    try {
        const data = await listMyWriteReceipts({
            authUser: req.auth,
            page: req.query.page,
            limit: req.query.limit,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            collectionName: req.query.collectionName,
            operation: req.query.operation,
            patientId: req.query.patientId,
        });

        return res.status(200).json({
            data,
            meta: { source: "real", model: "mongo" },
        });
    } catch (err) {
        if (err.code === "FORBIDDEN" || err.code === "INVALID_INPUT") {
            return res.status(err.code === "FORBIDDEN" ? 403 : 400).json({
                error: { code: err.code, message: err.message, retryable: false },
            });
        }

        logSafeError("WRITE_RECEIPTS_LIST_FAILED", err);
        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message: "Impossible de recuperer vos recus d'ecriture.",
                retryable: true,
            },
        });
    }
});

export default router;
