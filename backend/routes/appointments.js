import express from "express";
import {
    createAppointment,
    listAppointments,
    getAppointmentById,
    cancelAppointment,
} from "../services/appointments.js";
import { toCreateAppointmentDTO } from "../dto/appointment.dto.js";

const router = express.Router();

/* ------------------------------------------------------------------ */
/* POST /api/appointments                                              */
/* ------------------------------------------------------------------ */

router.post("/", async (req, res) => {
    /* ---------------- Mapping DTO ---------------- */

    const dto = toCreateAppointmentDTO(req.body);

    /* ---------------- Validation API (structure) ---------------- */

    if (
        !dto.patientInsuranceNumber ||
        !dto.specialist ||
        !dto.date ||
        !dto.time
    ) {
        return res.status(400).json({
            error: {
                code: "INVALID_INPUT",
                message:
                    "Champs requis manquants (patient, spécialiste, date, heure).",
                retryable: false,
            },
        });
    }

    /* ---------------- Appel service ---------------- */

    try {
        const appointment = await createAppointment(dto);

        return res.status(201).json({
            data: appointment,
            meta: {
                source: "real",
                model: "mongo",
            },
        });
    } catch (err) {
        /* ---------------- Erreurs métier ---------------- */

        if (err.code === "INVALID_TIME" || err.code === "INVALID_DATE") {
            return res.status(400).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        /* ---------------- Conflit créneau (Mongo) ---------------- */

        if (err.code === 11000) {
            return res.status(409).json({
                error: {
                    code: "APPOINTMENT_CONFLICT",
                    message:
                        "Ce créneau est déjà réservé pour ce spécialiste.",
                    retryable: false,
                },
            });
        }

        /* ---------------- Erreur inconnue ---------------- */

        console.error("❌ Appointment create error:", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible d’enregistrer le rendez-vous.",
                retryable: true,
            },
        });
    }
});

/* ------------------------------------------------------------------ */
/* GET /api/appointments                                               */
/* ------------------------------------------------------------------ */
router.get("/", async (req, res) => {
    try {
        const appointments = await listAppointments({
            specialist: req.query.specialist,
            date: req.query.date,
            patientInsuranceNumber:
            req.query.patientInsuranceNumber,
        });

        return res.status(200).json({
            data: appointments,
            meta: {
                source: "real",
                model: "mongo",
            },
        });
    } catch (err) {
        console.error("❌ Appointment list error:", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible de récupérer les rendez-vous.",
                retryable: true,
            },
        });
    }
});

/* ------------------------------------------------------------------ */
/* GET /api/appointments/:id                                           */
/* ------------------------------------------------------------------ */
router.get("/:id", async (req, res) => {
    try {
        const appointment = await getAppointmentById(req.params.id);

        return res.status(200).json({
            data: appointment,
            meta: {
                source: "real",
                model: "mongo",
            },
        });
    } catch (err) {
        if (err.code === "INVALID_ID") {
            return res.status(400).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        if (err.code === "NOT_FOUND") {
            return res.status(404).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        console.error("❌ Appointment get error:", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible de récupérer le rendez-vous.",
                retryable: true,
            },
        });
    }
});

/* ------------------------------------------------------------------ */
/* DELETE /api/appointments/:id (annulation)                           */
/* ------------------------------------------------------------------ */

router.delete("/:id", async (req, res) => {
    try {
        const appointment = await cancelAppointment(req.params.id);

        return res.status(200).json({
            data: appointment,
            meta: {
                source: "real",
                model: "mongo",
            },
        });
    } catch (err) {
        if (
            err.code === "INVALID_ID" ||
            err.code === "ALREADY_CANCELLED"
        ) {
            return res.status(400).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }



        if (err.code === "NOT_FOUND") {
            return res.status(404).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        console.error("❌ Appointment cancel error:", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible d’annuler le rendez-vous.",
                retryable: true,
            },
        });
    }
});

export default router;
