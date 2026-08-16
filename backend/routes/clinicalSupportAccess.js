import express from "express";
import { requireRole } from "../middleware/requireRole.js";
import { AUTH_ROLES } from "../auth/constants.js";
import { createPhysicianClinicalSupportRequest, listOpenClinicalSupportRequests, claimClinicalSupportRequest, listPendingClinicalSupportRequests, listActiveClinicalSupportAccessRequests, listPhysicianClinicalSupportRequestStatuses, listOwnActiveClinicalSupportAccessRequests, decideClinicalSupportAccessRequest, revokeClinicalSupportAccessRequest } from "../services/clinicalSupportAccess.js";
import { recordWriteOperationAuditEvent } from "../audit/writeOperationAudit.js";
import { getRequestContext } from "../app/requestContext.js";
import { getSafeRequestPath } from "../utils/requestLogSafety.js";
import { getTrustedRequestIp } from "../utils/requestIp.js";

const router = express.Router();

function sendError(res, err) {
    const status = ["FORBIDDEN"].includes(err.code) ? 403 : ["NOT_FOUND"].includes(err.code) ? 404 : ["INVALID_INPUT", "REQUEST_ALREADY_PENDING"].includes(err.code) ? 400 : 500;
    return res.status(status).json({ error: { code: err.code || "PERSISTENCE_FAILED", message: err.message || "Impossible de traiter la demande.", retryable: false } });
}

router.post("/physician-requests", requireRole(AUTH_ROLES.MEDECIN), async (req, res) => {
    try {
        const grant = await createPhysicianClinicalSupportRequest({ ...req.body, authUser: req.auth });
        const context = getRequestContext(req);
        await recordWriteOperationAuditEvent({
            collectionName: "clinicalsupportaccessrequests", operation: "CREATE", outcome: "SUCCESS",
            actorUserId: req.auth.userId, actorUsername: req.auth.username, actorRole: req.auth.role,
            ip: getTrustedRequestIp(req), requestId: context.requestId, instanceId: context.instanceId,
            resourceId: String(grant._id), patientId: String(grant.patientId), changedFields: ["status", "reasonCode"], requestPath: getSafeRequestPath(req),
        });
        return res.status(201).json({ data: { id: String(grant._id), status: grant.status, patientId: String(grant.patientId), reasonCode: grant.reasonCode }, meta: { source: "real", model: "mongo" } });
    } catch (err) { return sendError(res, err); }
});

router.get("/requests/open", requireRole(AUTH_ROLES.SUPERADMIN), async (req, res) => {
    try { return res.status(200).json({ data: await listOpenClinicalSupportRequests(req.auth), meta: { source: "real", model: "mongo" } }); }
    catch (err) { return sendError(res, err); }
});

router.post("/requests/:id/claim", requireRole(AUTH_ROLES.SUPERADMIN), async (req, res) => {
    try {
        const request = await claimClinicalSupportRequest({ requestId: req.params.id, justificationCode: req.body?.justificationCode, authUser: req.auth });
        const context = getRequestContext(req);
        await recordWriteOperationAuditEvent({
            collectionName: "clinicalsupportaccessrequests", operation: "UPDATE", outcome: "SUCCESS",
            actorUserId: req.auth.userId, actorUsername: req.auth.username, actorRole: req.auth.role,
            ip: getTrustedRequestIp(req), requestId: context.requestId, instanceId: context.instanceId,
            resourceId: String(request._id), patientId: String(request.patientId), changedFields: ["status", "requestedByUserId", "superadminJustificationCode"], requestPath: getSafeRequestPath(req),
        });
        return res.status(200).json({ data: { id: String(request._id), status: request.status }, meta: { source: "real", model: "mongo" } });
    } catch (err) { return sendError(res, err); }
});

router.get("/requests/inbox", requireRole(AUTH_ROLES.MEDECIN), async (req, res) => {
    try { return res.status(200).json({ data: await listPendingClinicalSupportRequests(req.auth), meta: { source: "real", model: "mongo" } }); }
    catch (err) { return sendError(res, err); }
});

router.get("/requests/active", requireRole(AUTH_ROLES.MEDECIN), async (req, res) => {
    try { return res.status(200).json({ data: await listActiveClinicalSupportAccessRequests(req.auth), meta: { source: "real", model: "mongo" } }); }
    catch (err) { return sendError(res, err); }
});

router.get("/physician-requests/statuses", requireRole(AUTH_ROLES.MEDECIN), async (req, res) => {
    try { return res.status(200).json({ data: await listPhysicianClinicalSupportRequestStatuses(req.auth), meta: { source: "real", model: "mongo" } }); }
    catch (err) { return sendError(res, err); }
});

router.get("/requests/mine", requireRole(AUTH_ROLES.SUPERADMIN), async (req, res) => {
    try { return res.status(200).json({ data: await listOwnActiveClinicalSupportAccessRequests(req.auth), meta: { source: "real", model: "mongo" } }); }
    catch (err) { return sendError(res, err); }
});

router.post("/requests/:id/decision", requireRole(AUTH_ROLES.MEDECIN), async (req, res) => {
    try {
        const request = await decideClinicalSupportAccessRequest({
            requestId: req.params.id,
            decision: req.body?.decision,
            durationMinutes: req.body?.durationMinutes,
            authUser: req.auth,
        });
        const context = getRequestContext(req);
        await recordWriteOperationAuditEvent({
            collectionName: "clinicalsupportaccessrequests", operation: "UPDATE", outcome: "SUCCESS",
            actorUserId: req.auth.userId, actorUsername: req.auth.username, actorRole: req.auth.role,
            ip: getTrustedRequestIp(req), requestId: context.requestId, instanceId: context.instanceId,
            resourceId: String(request._id), patientId: String(request.patientId), changedFields: ["status", "approvedAt", "expiresAt"], requestPath: getSafeRequestPath(req),
        });
        return res.status(200).json({ data: { id: String(request._id), status: request.status, expiresAt: request.expiresAt || null }, meta: { source: "real", model: "mongo" } });
    } catch (err) { return sendError(res, err); }
});

router.post("/requests/:id/revoke", requireRole(AUTH_ROLES.MEDECIN), async (req, res) => {
    try {
        const request = await revokeClinicalSupportAccessRequest({ requestId: req.params.id, authUser: req.auth });
        const context = getRequestContext(req);
        await recordWriteOperationAuditEvent({
            collectionName: "clinicalsupportaccessrequests", operation: "UPDATE", outcome: "SUCCESS",
            actorUserId: req.auth.userId, actorUsername: req.auth.username, actorRole: req.auth.role,
            ip: getTrustedRequestIp(req), requestId: context.requestId, instanceId: context.instanceId,
            resourceId: String(request._id), patientId: String(request.patientId), changedFields: ["status", "revokedAt"], requestPath: getSafeRequestPath(req),
        });
        return res.status(200).json({ data: { id: String(request._id), status: request.status, revokedAt: request.revokedAt }, meta: { source: "real", model: "mongo" } });
    } catch (err) { return sendError(res, err); }
});

export default router;
