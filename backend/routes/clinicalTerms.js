import express from "express";
import { requireRole } from "../middleware/requireRole.js";
import { AUTH_ROLES } from "../auth/constants.js";
import {
    createClinicalTermRequest,
    decideClinicalTermRequest,
    listApprovedClinicalTerms,
    listPendingClinicalTermRequests,
} from "../services/clinicalTermCatalog.js";

const router = express.Router();

function sendError(res, err) {
    const status = ["NOT_FOUND"].includes(err.code) ? 404 : 400;
    return res.status(status).json({ error: { code: err.code || "INVALID_INPUT", message: err.message, retryable: false } });
}

router.get("/approved", requireRole(AUTH_ROLES.MEDECIN, AUTH_ROLES.ADMIN, AUTH_ROLES.SUPERADMIN), async (_req, res) => {
    try {
        const data = await listApprovedClinicalTerms();
        return res.status(200).json({ data, meta: { source: "real", model: "mongo" } });
    } catch (err) { return sendError(res, err); }
});

router.post("/requests", requireRole(AUTH_ROLES.MEDECIN), async (req, res) => {
    try {
        const request = await createClinicalTermRequest({ term: req.body?.term, authUser: req.auth });
        return res.status(201).json({ data: { id: String(request._id), status: request.status }, meta: { source: "real", model: "mongo" } });
    } catch (err) { return sendError(res, err); }
});

router.get("/requests/pending", requireRole(AUTH_ROLES.SUPERADMIN), async (_req, res) => {
    try { return res.status(200).json({ data: await listPendingClinicalTermRequests(), meta: { source: "real", model: "mongo" } }); }
    catch (err) { return sendError(res, err); }
});

router.post("/requests/:id/decision", requireRole(AUTH_ROLES.SUPERADMIN), async (req, res) => {
    try {
        const request = await decideClinicalTermRequest({ requestId: req.params.id, decision: req.body?.decision, authUser: req.auth });
        return res.status(200).json({ data: { id: String(request._id), status: request.status }, meta: { source: "real", model: "mongo" } });
    } catch (err) { return sendError(res, err); }
});

export default router;
