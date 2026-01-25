import express from "express";
import {
    createAppointment,
    getAvailableSlots,
    getAppointmentById,
    cancelAppointment,
    updateAppointmentStatus,
    updateAppointmentSchedule,
} from "../services/appointments.js";
import { toCreateAppointmentDTO } from "../dto/appointment.dto.js";
import { Appointment } from "../models/Appointment.js"; // ✅ IMPORT MANQUANT
import { isValidRamq } from "../utils/validators.js";

const router = express.Router();

/* ------------------------------------------------------------------ */
/* GET /api/appointments/slots                                         */
/* ------------------------------------------------------------------ */

router.get("/slots", async (req, res) => {
    const { specialist, date } = req.query;

    try {
        const slots = await getAvailableSlots(specialist, date);

        return res.status(200).json({
            data: slots,
            meta: {
                source: "real",
                model: "computed",
            },
        });
    } catch (err) {
        if (err.code === "INVALID_INPUT") {
            return res.status(400).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        console.error("❌ Slot fetch error:", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message: "Impossible de récupérer les créneaux.",
                retryable: true,
            },
        });
    }
});

/* ------------------------------------------------------------------ */
/* POST /api/appointments                                              */
/* ------------------------------------------------------------------ */

router.post("/", async (req, res) => {
    const dto = toCreateAppointmentDTO(req.body);

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

    if (!isValidRamq(dto.patientInsuranceNumber)) {
        return res.status(400).json({
            error: {
                code: "INVALID_INPUT",
                message:
                    "Numéro RAMQ invalide. Format requis : RAMQXXXXXXXXXX.",
                retryable: false,
            },
        });
    }

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
        if (
            err.code === "INVALID_INPUT" ||
            err.code === "INVALID_TIME" ||
            err.code === "INVALID_DATE"
        ) {
            return res.status(400).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        if (err.code === "SPECIALIST_ALREADY_BOOKED") {
            return res.status(409).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

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
/* GET /api/appointments (PAGINATION BACKEND)                          */
/* ------------------------------------------------------------------ */

router.get("/", async (req, res) => {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const filters = {};

    if (req.query.specialist) {
        filters.specialist = req.query.specialist;
    }
    if (req.query.status) {
        filters.status = req.query.status;
    }
    if (req.query.patientInsuranceNumber !== undefined) {
        if (!isValidRamq(req.query.patientInsuranceNumber)) {
            return res.status(400).json({
                error: {
                    code: "INVALID_INPUT",
                    message:
                        "Numéro RAMQ invalide. Format requis : RAMQXXXXXXXXXX.",
                    retryable: false,
                },
            });
        }
        filters.patientInsuranceNumber =
            req.query.patientInsuranceNumber;
    }

    try {
        const [data, total] = await Promise.all([
            Appointment.find(filters)
                .sort({ date: 1, time: 1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Appointment.countDocuments(filters),
        ]);

        return res.status(200).json({
            data: {
                data,
                meta: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                    source: "real",
                    model: "mongo",
                },
            },
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
/* DELETE /api/appointments/:id                                        */
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

/* ------------------------------------------------------------------ */
/* PATCH /api/appointments/:id/status                                  */
/* ------------------------------------------------------------------ */

router.patch("/:id/status", async (req, res) => {
    const { status } = req.body;

    if (!status) {
        return res.status(400).json({
            error: {
                code: "INVALID_INPUT",
                message: "Le champ 'status' est requis.",
                retryable: false,
            },
        });
    }

    try {
        const appointment =
            await updateAppointmentStatus(req.params.id, status);

        return res.status(200).json({
            data: appointment,
            meta: {
                source: "real",
                model: "mongo",
            },
        });
    } catch (err) {
        if (
            [
                "INVALID_ID",
                "INVALID_STATUS",
                "STATUS_IMMUTABLE",
            ].includes(err.code)
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

        console.error(
            "❌ Appointment status update error:",
            err
        );

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible de mettre à jour le statut du rendez-vous.",
                retryable: true,
            },
        });
    }
});

/* ------------------------------------------------------------------ */
/* PATCH /api/appointments/:id/schedule                                */
/* ------------------------------------------------------------------ */

router.patch("/:id/schedule", async (req, res) => {
    const { date, time } = req.body;

    if (!date || !time) {
        return res.status(400).json({
            error: {
                code: "INVALID_INPUT",
                message: "Les champs 'date' et 'time' sont requis.",
                retryable: false,
            },
        });
    }

    try {
        const appointment = await updateAppointmentSchedule(
            req.params.id,
            { date, time }
        );

        return res.status(200).json({
            data: appointment,
            meta: {
                source: "real",
                model: "mongo",
            },
        });
    } catch (err) {
        if (
            [
                "INVALID_ID",
                "INVALID_INPUT",
                "INVALID_TIME",
                "INVALID_DATE",
                "STATUS_IMMUTABLE",
                "SPECIALIST_ALREADY_BOOKED",
            ].includes(err.code)
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

        console.error(
            "❌ Appointment schedule update error:",
            err
        );

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible de modifier l’horaire du rendez-vous.",
                retryable: true,
            },
        });
    }
});

export default router;
