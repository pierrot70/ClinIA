import express from "express";
import {
    listCoordinationRequests,
    verifyCoordinationRequestAvailability,
} from "../services/coordinationRequests.js";
import { logSafeError } from "../utils/requestLogSafety.js";
import { recordWriteOperationAuditEvent } from "../audit/writeOperationAudit.js";
import { getRequestContext } from "../app/requestContext.js";
import { getTrustedRequestIp } from "../utils/requestIp.js";

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const data = await listCoordinationRequests({
            authUser: req.auth,
            page: req.query.page,
            limit: req.query.limit,
            status: req.query.status,
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
        logSafeError("COORDINATION_REQUEST_LIST_FAILED", err);
        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message: "Impossible de récupérer les demandes de coordination.",
                retryable: true,
            },
        });
    }
});

router.patch("/:id/verify-availability", async (req, res) => {
    try {
        const result = await verifyCoordinationRequestAvailability({
            requestId: req.params.id,
            authUser: req.auth,
        });
        const context = getRequestContext(req);
        await recordWriteOperationAuditEvent({
            collectionName: "appointmentcoordinationrequests",
            operation: "UPDATE",
            outcome: "SUCCESS",
            actorUserId: req.auth?.userId ?? null,
            actorUsername: req.auth?.username ?? null,
            actorRole: req.auth?.role ?? null,
            ip: getTrustedRequestIp(req),
            requestId: context.requestId,
            instanceId: context.instanceId,
            resourceId: String(result.request._id),
            patientId: String(result.request.patient),
            changedFields: ["availabilityVerifiedAt", "status"],
        });
        return res.status(200).json({
            data: {
                id: String(result.request._id),
                status: result.request.status,
                availability: result.availability,
            },
            meta: { source: "real", model: "mongo" },
        });
    } catch (err) {
        if (["FORBIDDEN", "INVALID_INPUT", "INVALID_STATE", "NOT_FOUND", "NO_SPECIALISTS_FOR_SPECIALTY", "NO_AVAILABLE_SLOTS_FOR_SPECIALTY"].includes(err.code)) {
            const status = err.code === "NOT_FOUND" ? 404 : err.code === "FORBIDDEN" ? 403 : ["NO_SPECIALISTS_FOR_SPECIALTY", "NO_AVAILABLE_SLOTS_FOR_SPECIALTY"].includes(err.code) ? 409 : 400;
            return res.status(status).json({
                error: { code: err.code, message: err.message, retryable: false },
            });
        }
        logSafeError("COORDINATION_REQUEST_AVAILABILITY_VERIFICATION_FAILED", err);
        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message: "Impossible de vérifier la disponibilité pour cette demande.",
                retryable: true,
            },
        });
    }
});

export default router;
