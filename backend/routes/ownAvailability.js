import express from "express";
import {
    completeOwnAvailability,
    getOwnAvailabilityTemplate,
    saveOwnAvailabilityTemplate,
} from "../services/ownAvailability.js";
import { getRequestContext } from "../app/requestContext.js";
import { recordWriteOperationAuditEvent } from "../audit/writeOperationAudit.js";
import { CLINICAL_WRITE_CONCERN } from "../db/clinicalWriteConcern.js";
import { getSafeRequestPath, logSafeError } from "../utils/requestLogSafety.js";
import { getTrustedRequestIp } from "../utils/requestIp.js";

const router = express.Router();

function ownAvailabilityRoute(handler) {
    return async (req, res) => {
        try {
            const context = getRequestContext(req);
            const audit = ({ specialistId, changedFields, session }) => recordWriteOperationAuditEvent({
                collectionName: "specialists",
                operation: "UPDATE",
                outcome: "SUCCESS",
                actorUserId: req.auth.userId,
                actorUsername: req.auth.username,
                actorRole: req.auth.role,
                resourceId: String(specialistId),
                requestId: context.requestId,
                instanceId: context.instanceId,
                requestPath: getSafeRequestPath(req),
                ip: getTrustedRequestIp(req),
                changedFields,
                writeConcern: CLINICAL_WRITE_CONCERN,
                session,
                throwOnError: true,
            });
            const data = await handler(req, audit);
            return res.set("Cache-Control", "no-store").json({ data });
        } catch (error) {
            const status = {
                INVALID_SCHEDULE: 400,
                OVERLAPPING_SCHEDULE: 400,
                SCHEDULE_UNAVAILABLE: 409,
                SCHEDULE_REQUIRED: 409,
            }[error.code];
            if (status) {
                return res.status(status).json({ error: { code: error.code, message: error.message, retryable: false } });
            }
            logSafeError("OWN_AVAILABILITY_FAILED", error);
            return res.status(500).json({ error: {
                code: "PERSISTENCE_FAILED",
                message: "Impossible de traiter vos disponibilités.",
                retryable: true,
            } });
        }
    };
}

router.get("/template", ownAvailabilityRoute(req => getOwnAvailabilityTemplate(req.auth)));
router.put("/template", ownAvailabilityRoute((req, audit) => saveOwnAvailabilityTemplate(req.auth, req.body?.ranges, audit)));
router.post("/complete", ownAvailabilityRoute((req, audit) => completeOwnAvailability(req.auth, audit)));

export default router;
