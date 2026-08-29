import express from "express";
import { AdminUser } from "../models/AdminUser.js";
import { Clinique } from "../models/Clinique.js";
import {
    createWalkInPatientAndAppointment,
    findReceptionPatientByRamq,
    listWalkInFamilyMedicineOptions,
} from "../services/reception.js";
import { toCreatePatientDTO } from "../dto/patient.dto.js";
import { getRequestContext } from "../app/requestContext.js";
import { getSafeRequestPath } from "../utils/requestLogSafety.js";
import { getTrustedRequestIp } from "../utils/requestIp.js";

const router = express.Router();

// A reception account receives only its explicitly assigned clinic directory.
// No patient or scheduling data is exposed by this endpoint.
router.get("/clinics", async (req, res) => {
    try {
        const user = await AdminUser.findOne({
            _id: req.auth?.userId,
            isActive: true,
            role: "RECEPTION",
        }, { assignedClinics: 1 }).lean();

        if (!user) {
            return res.status(403).json({
                error: {
                    code: "FORBIDDEN",
                    message: "Compte reception invalide ou inactif.",
                    retryable: false,
                },
            });
        }

        const assignedIds = (user.assignedClinics || []).map(String);
        const clinics = await Clinique.find(
            { _id: { $in: assignedIds } },
            { nom: 1 }
        ).lean();
        const byId = new Map(clinics.map((clinic) => [String(clinic._id), clinic]));

        return res.status(200).json({
            data: assignedIds
                .map((clinicId) => byId.get(clinicId))
                .filter(Boolean)
                .map((clinic) => ({ _id: String(clinic._id), nom: clinic.nom })),
            meta: { source: "real", model: "mongo" },
        });
    } catch {
        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message: "Impossible de récupérer les cliniques de réception.",
                retryable: true,
            },
        });
    }
});

router.get("/walk-in-options", async (req, res) => {
    try {
        const data = await listWalkInFamilyMedicineOptions({
            clinicId: req.query.clinic,
            patientId: req.query.patient,
            authUser: req.auth,
        });
        return res.status(200).json({
            data,
            meta: { source: "real", model: "computed" },
        });
    } catch (err) {
        if (err.code === "INVALID_INPUT" || err.code === "FORBIDDEN") {
            return res.status(err.code === "FORBIDDEN" ? 403 : 400).json({
                error: { code: err.code, message: err.message, retryable: false },
            });
        }
        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message: "Impossible de rechercher les créneaux de consultation.",
                retryable: true,
            },
        });
    }
});

router.get("/patient-lookup", async (req, res) => {
    try {
        const data = await findReceptionPatientByRamq({
            clinicId: req.query.clinic,
            ramq: req.query.ramq,
            authUser: req.auth,
            audit: {
                actorUserId: req.auth?.userId,
                actorUsername: req.auth?.username,
                ip: getTrustedRequestIp(req),
                requestPath: getSafeRequestPath(req),
            },
        });
        return res.status(200).json({
            data,
            meta: { source: "real", model: "mongo" },
        });
    } catch (err) {
        if (err.code === "INVALID_INPUT" || err.code === "FORBIDDEN") {
            return res.status(err.code === "FORBIDDEN" ? 403 : 400).json({
                error: { code: err.code, message: err.message, retryable: false },
            });
        }
        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message: "Impossible de rechercher le patient.",
                retryable: true,
            },
        });
    }
});

router.post("/walk-in-bookings", async (req, res) => {
    let patientDto;
    try {
        patientDto = toCreatePatientDTO(req.body?.patient || {});
    } catch (err) {
        return res.status(400).json({
            error: {
                code: err.code || "INVALID_INPUT",
                message: err.message || "Informations patient invalides.",
                retryable: false,
            },
        });
    }

    if (
        !patientDto.nom ||
        !patientDto.prenom ||
        !patientDto.num_assurance_maladie ||
        !req.body?.specialist ||
        !req.body?.clinic ||
        !req.body?.date ||
        !req.body?.time
    ) {
        return res.status(400).json({
            error: {
                code: "INVALID_INPUT",
                message: "Le patient, le créneau et la clinique sont requis.",
                retryable: false,
            },
        });
    }

    try {
        const requestContext = getRequestContext(req);
        const data = await createWalkInPatientAndAppointment({
            clinicId: req.body.clinic,
            specialistId: req.body.specialist,
            date: req.body.date,
            time: req.body.time,
            patientDto,
            authUser: req.auth,
            audit: {
                actorUserId: req.auth?.userId,
                actorUsername: req.auth?.username,
                ip: getTrustedRequestIp(req),
                requestPath: getSafeRequestPath(req),
                requestId: requestContext.requestId,
                instanceId: requestContext.instanceId,
            },
        });
        return res.status(201).json({
            data,
            meta: { source: "real", model: "mongo" },
        });
    } catch (err) {
        if (
            [
                "INVALID_INPUT",
                "INVALID_TIME",
                "INVALID_DATE",
                "PATIENT_ARCHIVED",
            ].includes(err.code)
        ) {
            return res.status(400).json({
                error: { code: err.code, message: err.message, retryable: false },
            });
        }
        if (
            [
                "FORBIDDEN",
                "NO_AVAILABILITY",
                "PATIENT_ALREADY_EXISTS",
                "SPECIALIST_ALREADY_BOOKED",
                "PATIENT_ALREADY_BOOKED",
                "MAXIMUM_APPOINTMENTS_REACHED",
            ].includes(err.code)
        ) {
            return res.status(err.code === "FORBIDDEN" ? 403 : 409).json({
                error: { code: err.code, message: err.message, retryable: false },
            });
        }
        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message: "Impossible de créer le dossier et le rendez-vous.",
                retryable: true,
            },
        });
    }
});

export default router;
