import express from "express";
import { requireRole } from "../middleware/requireRole.js";
import { listEligibleCareClinicians, listPatientCareGrants, issuePatientCareGrant, revokePatientCareGrant, listIncomingCareGrants, readSharedCareRecord, listOwnedSharedCareNotes, appendSharedCareNote } from "../services/clinicalCareAccess.js";
import { extendGeneralTransfer, getTransferReminder, requestGeneralTransfer, getTransferCapabilities, setTransferPreference, getCareTransferContext, listCareTransfers, requestCareTransfer, readCareTransferRecord, decideCareTransfer, cancelCareTransfer } from "../services/clinicalCareAccess.js";
import { getTrustedRequestIp } from "../utils/requestIp.js";
import { getRequestContext } from "../app/requestContext.js";
import { createWriteVerificationContext, buildWriteVerificationMeta } from "../audit/writeVerification.js";

const router = express.Router();
const failure = (res, error) => {
    const codes = { INVALID_INPUT: 400, FORBIDDEN: 403, CARE_ACCESS_ALREADY_ACTIVE: 409,
        TRANSFER_CLINIC_REQUIRED: 409, TRANSFER_CONSENT_REQUIRED: 400, TRANSFER_ALREADY_PENDING: 409, TRANSFER_PATIENT_CONFLICT: 409, TRANSFER_RECIPIENT_UNAVAILABLE: 409, TRANSFER_EXTENSION_UNAVAILABLE: 409 };
    const code = Object.hasOwn(codes, error?.code) ? error.code : "PERSISTENCE_FAILED";
    return res.status(codes[code] || 500).json({ error: { code, message: "La demande d’accès clinique ne peut pas être traitée.", retryable: false } });
};
const handle = (work, { write = false, status = 200, fields = [] } = {}) => async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (write && (!req.body || typeof req.body !== "object" || Array.isArray(req.body)
        || Object.keys(req.body).some(k => ![...fields, "clientMutationId"].includes(k)))) return failure(res, { code: "INVALID_INPUT" });
    try {
        const context = getRequestContext(req);
        const verification = write ? createWriteVerificationContext(req) : {};
        const metadata = { ...verification, ip: getTrustedRequestIp(req), requestId: context.requestId, instanceId: context.instanceId };
        const result = await work(req, metadata);
        return res.status(status).json(write
            ? { data: result.data, meta: { source: "real", model: "mongo", writeVerification: buildWriteVerificationMeta({ ...verification, writeAuditRecorded: result.writeAuditRecorded }) } }
            : { data: result, meta: { source: "real", model: "mongo" } });
    } catch (error) { return failure(res, error); }
};

// Mounted separately after verifyJWT; no existing clinical/admin guards change.
router.get("/eligible-clinicians", requireRole("IPS"), handle(req => listEligibleCareClinicians(req.auth)));
router.get("/patients/:id/grants", requireRole("IPS"), handle(req => listPatientCareGrants(req.params.id, req.auth)));
router.post("/patients/:id/grants", requireRole("IPS"), handle((req, meta) => issuePatientCareGrant(req.params.id, req.body, req.auth, meta), { write: true, status: 201, fields: ["targetUserId", "durationMinutes"] }));
router.post("/grants/:id/revoke", requireRole("IPS"), handle((req, meta) => revokePatientCareGrant(req.params.id, req.auth, meta), { write: true }));
router.get("/patients/:id/notes", requireRole("IPS"), handle((req, meta) => listOwnedSharedCareNotes(req.params.id, req.auth, meta)));
router.get("/grants", requireRole("MEDECIN"), handle((req, meta) => listIncomingCareGrants(req.auth, meta)));
router.get("/grants/:id/record", requireRole("MEDECIN"), handle((req, meta) => readSharedCareRecord(req.params.id, req.auth, meta)));
router.post("/grants/:id/notes", requireRole("MEDECIN"), handle((req, meta) => appendSharedCareNote(req.params.id, req.body.note, req.auth, meta), { write: true, status: 201, fields: ["note"] }));
router.get("/transfer-reminder", requireRole("IPS", "MEDECIN"), handle(req => getTransferReminder(req.auth)));
router.get("/transfer-capabilities", requireRole("IPS", "MEDECIN"), handle(req => getTransferCapabilities(req.auth)));
router.post("/transfer-preference", requireRole("MEDECIN"), handle((req, meta) => setTransferPreference(req.body.acceptsNewPatients, req.auth, meta),
    { write: true, fields: ["acceptsNewPatients"] }));
router.get("/patients/:id/transfer-context", requireRole("IPS", "MEDECIN"), handle(req => getCareTransferContext(req.params.id, req.auth, req.query.clinicId)));
router.get("/transfers", requireRole("IPS", "MEDECIN"), handle((req, meta) => listCareTransfers(req.auth, meta)));
router.post("/patients/:id/general-transfer", requireRole("IPS", "MEDECIN"), handle((req, meta) => requestGeneralTransfer(req.params.id, req.body, req.auth, meta),
    { write: true, status: 201, fields: ["clinicId", "patientConsent"] }));
router.post("/patients/:id/transfers", requireRole("IPS", "MEDECIN"), handle((req, meta) => requestCareTransfer(req.params.id, req.body, req.auth, meta),
    { write: true, status: 201, fields: ["targetUserId", "clinicId", "patientConsent"] }));
router.post("/transfers/:id/extend", requireRole("IPS", "MEDECIN"), handle((req, meta) => extendGeneralTransfer(req.params.id, req.body, req.auth, meta),
    { write: true, fields: ["clinicId", "patientConsent"] }));
router.get("/transfers/:id/record", requireRole("MEDECIN"), handle((req, meta) => readCareTransferRecord(req.params.id, req.auth, meta)));
router.post("/transfers/:id/decision", requireRole("MEDECIN"), handle((req, meta) => decideCareTransfer(req.params.id, req.body, req.auth, meta),
    { write: true, fields: ["decision"] }));
router.post("/transfers/:id/cancel", requireRole("IPS", "MEDECIN"), handle((req, meta) => cancelCareTransfer(req.params.id, req.auth, meta), { write: true }));
export default router;
