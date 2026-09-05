import express from "express";
import { listConsultations, readConsultation, addConsultationNote, acceptPatientCare } from "../services/consultations.js";
import { getTrustedRequestIp } from "../utils/requestIp.js";

const router = express.Router();
const handle = (work, status = 200) => async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
        const data = await work(req, { ip: getTrustedRequestIp(req) });
        res.status(status).json({ data });
    } catch (err) {
        const statuses = { INVALID_INPUT: 400, FORBIDDEN: 403, CARE_ALREADY_ASSIGNED: 409 };
        const code = Object.hasOwn(statuses, err?.code) ? err.code : "PERSISTENCE_FAILED";
        res.status(statuses[code] || 500).json({ error: { code, message: "Consultation request could not be completed." } });
    }
};
router.get("/", handle((req, metadata) => listConsultations(req.auth, metadata)));
router.get("/:appointmentId", handle((req, metadata) => readConsultation(req.params.appointmentId, req.auth, metadata)));
router.post("/:appointmentId/notes", handle((req, metadata) => addConsultationNote(req.params.appointmentId, req.body?.note, req.auth, metadata), 201));
router.post("/:appointmentId/accept-care", handle((req, metadata) => acceptPatientCare(req.params.appointmentId, req.auth, metadata)));
export default router;
