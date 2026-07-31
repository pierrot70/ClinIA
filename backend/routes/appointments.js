import express from "express";
import {
    createAppointmentWithWriteVerification,
    getAvailableSlotSchedule,
    getAppointmentById,
    cancelAppointmentWithWriteVerification,
    updateAppointmentStatusWithWriteVerification,
    updateAppointmentScheduleWithWriteVerification,
    listAppointmentsPaginated,
} from "../services/appointments.js";
import { toCreateAppointmentDTO } from "../dto/appointment.dto.js";
import mongoose from "mongoose";
import { getRequestContext } from "../app/requestContext.js";
import { CLINICAL_WRITE_CONCERN } from "../db/clinicalWriteConcern.js";
import { getReplicaSetStatus } from "../services/dbStatus.js";
import {
    buildWriteVerificationMeta,
    createWriteVerificationContext,
} from "../audit/writeVerification.js";
import { getSafeRequestPath, logSafeError } from "../utils/requestLogSafety.js";
import { getTrustedRequestIp } from "../utils/requestIp.js";

const router = express.Router();

function getRequestIp(req) {
    return getTrustedRequestIp(req);
}

async function buildAppointmentWriteAudit(req, { changedFields = [] }) {
    const requestContext = getRequestContext(req);
    const { verificationId, clientMutationId } =
        createWriteVerificationContext(req);

    return {
        verificationId,
        clientMutationId,
        actorUserId: req.auth?.userId ?? null,
        actorUsername: req.auth?.username ?? null,
        actorRole: req.auth?.role ?? null,
        ip: getRequestIp(req),
        requestId: requestContext.requestId,
        instanceId: requestContext.instanceId,
        changedFields,
        requestPath: getSafeRequestPath(req),
        writeConcern: CLINICAL_WRITE_CONCERN,
        replicaSet: await getReplicaSetStatus(),
    };
}

/* ------------------------------------------------------------------ */
/* GET /api/appointments/slots                                         */
/* ------------------------------------------------------------------ */

router.get("/slots", async (req, res) => {
    const { specialist, date, patient } = req.query;

    try {
        const schedule = await getAvailableSlotSchedule(specialist, date, {
            patient,
            authUser: req.auth,
        });

        return res.status(200).json({
            data: schedule,
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

        logSafeError("APPOINTMENT_SLOT_LIST_FAILED", err);

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

    if (!dto.patient || !dto.specialist || !dto.date || !dto.time) {
        return res.status(400).json({
            error: {
                code: "INVALID_INPUT",
                message:
                    "Champs requis manquants (patient, spécialiste, date, heure).",
                retryable: false,
            },
        });
    }

    try {
        const audit = await buildAppointmentWriteAudit(req, {
            changedFields: Object.keys(dto),
        });
        const { appointment, writeAuditRecorded } =
            await createAppointmentWithWriteVerification(dto, req.auth, audit);
        const writeVerification = buildWriteVerificationMeta({
            writeAuditRecorded,
            verificationId: audit.verificationId,
            clientMutationId: audit.clientMutationId,
        });

        return res.status(201).json({
            data: appointment,
            meta: {
                source: "real",
                model: "mongo",
                writeVerification,
            },
        });
    } catch (err) {
        if (
            err.code === "INVALID_INPUT" ||
            err.code === "INVALID_TIME" ||
            err.code === "INVALID_DATE" ||
            err.code === "NO_AVAILABILITY" ||
            err.code === "PATIENT_ARCHIVED"
        ) {
            return res.status(400).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        if (
            err.code === "SPECIALIST_ALREADY_BOOKED" ||
            err.code === "PATIENT_ALREADY_BOOKED" ||
            err.code === "MAXIMUM_APPOINTMENTS_REACHED"
        ) {
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

        logSafeError("APPOINTMENT_CREATE_FAILED", err);

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

    const filters = {};

    if (req.query.specialist) {
        if (!mongoose.Types.ObjectId.isValid(req.query.specialist)) {
            return res.status(400).json({
                error: {
                    code: "INVALID_INPUT",
                    message: "Identifiant de spécialiste invalide.",
                    retryable: false,
                },
            });
        }
        filters.specialist = req.query.specialist;
    }
    if (req.query.status) {
        filters.status = req.query.status;
    }
    if (req.query.patientInsuranceNumber !== undefined) {
        const patientInsuranceNumber = String(
            req.query.patientInsuranceNumber
        ).trim();
        if (patientInsuranceNumber.length > 80) {
            return res.status(400).json({
                error: {
                    code: "INVALID_INPUT",
                    message: "Numéro d'assurance maladie invalide.",
                    retryable: false,
                },
            });
        }
        filters.patientInsuranceNumber = patientInsuranceNumber;
    }

    try {
        const { data, meta } = await listAppointmentsPaginated({
            ...filters,
            page,
            limit,
            authUser: req.auth,
        });

        return res.status(200).json({
            data: {
                data,
                meta: {
                    ...meta,
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
        logSafeError("APPOINTMENT_LIST_FAILED", err);

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
        const appointment = await getAppointmentById(req.params.id, req.auth);

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

        logSafeError("APPOINTMENT_GET_FAILED", err);

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
        const audit = await buildAppointmentWriteAudit(req, {
            changedFields: ["status"],
        });
        const { appointment, writeAuditRecorded } =
            await cancelAppointmentWithWriteVerification(req.params.id, req.auth, audit);
        const writeVerification = buildWriteVerificationMeta({
            writeAuditRecorded,
            verificationId: audit.verificationId,
            clientMutationId: audit.clientMutationId,
        });

        return res.status(200).json({
            data: appointment,
            meta: {
                source: "real",
                model: "mongo",
                writeVerification,
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

        logSafeError("APPOINTMENT_CANCEL_FAILED", err);

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
        const audit = await buildAppointmentWriteAudit(req, {
            changedFields: ["status"],
        });
        const { appointment, writeAuditRecorded } =
            await updateAppointmentStatusWithWriteVerification(
                req.params.id,
                status,
                req.auth,
                audit
            );
        const writeVerification = buildWriteVerificationMeta({
            writeAuditRecorded,
            verificationId: audit.verificationId,
            clientMutationId: audit.clientMutationId,
        });

        return res.status(200).json({
            data: appointment,
            meta: {
                source: "real",
                model: "mongo",
                writeVerification,
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

        logSafeError("APPOINTMENT_STATUS_UPDATE_FAILED", err);

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
        const audit = await buildAppointmentWriteAudit(req, {
            changedFields: ["date", "time"],
        });
        const { appointment, writeAuditRecorded } =
            await updateAppointmentScheduleWithWriteVerification(
                req.params.id,
                { date, time },
                req.auth,
                audit
            );
        const writeVerification = buildWriteVerificationMeta({
            writeAuditRecorded,
            verificationId: audit.verificationId,
            clientMutationId: audit.clientMutationId,
        });

        return res.status(200).json({
            data: appointment,
            meta: {
                source: "real",
                model: "mongo",
                writeVerification,
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

        if (
            [
                "SPECIALIST_ALREADY_BOOKED",
                "PATIENT_ALREADY_BOOKED",
                "MAXIMUM_APPOINTMENTS_REACHED",
            ].includes(err.code)
        ) {
            return res.status(409).json({
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

        logSafeError("APPOINTMENT_SCHEDULE_UPDATE_FAILED", err);

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
