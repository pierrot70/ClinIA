import { Appointment } from "../models/Appointment.js";
import { Specialist } from "../models/Specialist.js";
import { Patient } from "../models/Patient.js";
import { Clinique } from "../models/Clinique.js";
import mongoose from "mongoose";
import { isValidRamq } from "../utils/validators.js";
import { buildOwnerScope } from "../auth/resourceAccess.js";
import { CLINICAL_WRITE_CONCERN } from "../db/clinicalWriteConcern.js";

/* ------------------------------------------------------------------ */
/* Service Appointment                                                 */
/* ------------------------------------------------------------------ */

export async function createAppointment(dto, authUser) {
    /* ---------------- Validation métier ---------------- */

    const ALLOWED_PRIORITIES = ["normal", "urgent"];

    if (!mongoose.Types.ObjectId.isValid(dto.patient)) {
        throw {
            code: "INVALID_INPUT",
            message: "Identifiant patient invalide.",
        };
    }

    if (!ALLOWED_PRIORITIES.includes(dto.priority)) {
        throw {
            code: "INVALID_PRIORITY",
            message: "Priorité invalide (normal ou urgent).",
        };
    }

    // Heures ouvrables
    const [hour] = dto.time.split(":").map(Number);
    if (hour < 8 || hour >= 17) {
        throw {
            code: "INVALID_TIME",
            message: "Le rendez-vous doit être entre 08:00 et 17:00.",
        };
    }

    // Date passée
    const appointmentDate = new Date(`${dto.date}T${dto.time}`);
    if (appointmentDate < new Date()) {
        throw {
            code: "INVALID_DATE",
            message: "Impossible de créer un rendez-vous dans le passé.",
        };
    }

    if (!mongoose.Types.ObjectId.isValid(dto.specialist)) {
        throw {
            code: "INVALID_INPUT",
            message: "Identifiant de spécialiste invalide.",
        };
    }

    if (dto.clinique && !mongoose.Types.ObjectId.isValid(dto.clinique)) {
        throw {
            code: "INVALID_INPUT",
            message: "Identifiant de clinique invalide.",
        };
    }

    const patient = await Patient.findOne({
        _id: dto.patient,
        ...buildOwnerScope(authUser),
    }).lean();
    if (!patient) {
        throw {
            code: "INVALID_INPUT",
            message: "Patient introuvable.",
        };
    }

    if (!isValidRamq(patient.num_assurance_maladie)) {
        throw {
            code: "INVALID_INPUT",
            message:
                "Numéro RAMQ invalide. Format requis : RAMQXXXXXXXXXX.",
        };
    }

    const specialist = await Specialist.findById(dto.specialist, {
        clinique_associer: 1,
    }).lean();
    if (!specialist) {
        throw {
            code: "INVALID_INPUT",
            message: "Spécialiste introuvable.",
        };
    }

    if (dto.clinique) {
        const cliniqueExists = await Clinique.exists({ _id: dto.clinique });

        if (!cliniqueExists) {
            throw {
                code: "INVALID_INPUT",
                message: "Clinique introuvable.",
            };
        }

        if (String(specialist.clinique_associer || "") !== dto.clinique) {
            throw {
                code: "INVALID_INPUT",
                message:
                    "Le spécialiste sélectionné n'est pas associé à cette clinique.",
            };
        }
    }

    const availableSlots = await getAvailableSlots(
        dto.specialist,
        dto.date
    );
    if (!availableSlots.includes(dto.time)) {
        throw {
            code: "NO_AVAILABILITY",
            message:
                "Aucun créneau disponible pour ce spécialiste.",
        };
    }

    /* -------------------------------------------------- */
    /* RÈGLE MÉTIER MAJEURE                               */
    /* Un patient = un seul rendez-vous par spécialiste  */
    /* -------------------------------------------------- */

    const existing = await Appointment.findOne({
        patient: dto.patient,
        specialist: dto.specialist,
        status: "scheduled",
    }).lean();

    if (existing) {
        throw {
            code: "SPECIALIST_ALREADY_BOOKED",
            message:
                "Ce patient a déjà un rendez-vous avec ce spécialiste.",
        };
    }

    /* ---------------- Persistance ---------------- */

    const appointment = new Appointment({
        ...dto,
        patientInsuranceNumber: patient.num_assurance_maladie,
        ownerUserId: patient.ownerUserId || authUser.userId,
    });

    return appointment.save(CLINICAL_WRITE_CONCERN);
}

/* ------------------------------------------------------------------ */
/* GET appointments                                                    */
/* ------------------------------------------------------------------ */

export async function listAppointments(filters = {}, authUser) {
    const query = buildOwnerScope(authUser);

    if (filters.specialist) query.specialist = filters.specialist;
    if (filters.date) query.date = filters.date;
    if (filters.patientInsuranceNumber) {
        query.patientInsuranceNumber = filters.patientInsuranceNumber;
    }

    return Appointment.find(query)
        .sort({ date: 1, time: 1 })
        .lean();
}

/* ------------------------------------------------------------------ */
/* GET appointment by id                                               */
/* ------------------------------------------------------------------ */

export async function getAppointmentById(id, authUser) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant de rendez-vous invalide.",
        };
    }

    const appointment = await Appointment.findOne({
        _id: id,
        ...buildOwnerScope(authUser),
    }).lean();

    if (!appointment) {
        throw {
            code: "NOT_FOUND",
            message: "Rendez-vous introuvable.",
        };
    }

    return appointment;
}

/* ------------------------------------------------------------------ */
/* Cancel appointment (soft delete)                                   */
/* ------------------------------------------------------------------ */

export async function cancelAppointment(id, authUser) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant de rendez-vous invalide.",
        };
    }

    const appointment = await Appointment.findOne({
        _id: id,
        ...buildOwnerScope(authUser),
    });

    if (!appointment) {
        throw {
            code: "NOT_FOUND",
            message: "Rendez-vous introuvable.",
        };
    }

    if (appointment.status === "cancelled") {
        throw {
            code: "ALREADY_CANCELLED",
            message: "Ce rendez-vous est déjà annulé.",
        };
    }

    appointment.status = "cancelled";
    await appointment.save(CLINICAL_WRITE_CONCERN);

    return appointment;
}

/* ------------------------------------------------------------------ */
/* Update appointment status                                           */
/* ------------------------------------------------------------------ */

const ALLOWED_STATUSES = ["scheduled", "cancelled", "completed"];

export async function updateAppointmentStatus(id, newStatus, authUser) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant de rendez-vous invalide.",
        };
    }

    if (!ALLOWED_STATUSES.includes(newStatus)) {
        throw {
            code: "INVALID_STATUS",
            message:
                "Statut invalide. Valeurs autorisées : scheduled, cancelled, completed.",
        };
    }

    const appointment = await Appointment.findOne({
        _id: id,
        ...buildOwnerScope(authUser),
    });

    if (!appointment) {
        throw {
            code: "NOT_FOUND",
            message: "Rendez-vous introuvable.",
        };
    }

    if (appointment.status === "cancelled") {
        throw {
            code: "STATUS_IMMUTABLE",
            message:
                "Un rendez-vous annulé ne peut pas être modifié.",
        };
    }

    if (
        appointment.status === "completed" &&
        newStatus !== "completed"
    ) {
        throw {
            code: "STATUS_IMMUTABLE",
            message:
                "Un rendez-vous complété ne peut pas être modifié.",
        };
    }

    appointment.status = newStatus;
    await appointment.save(CLINICAL_WRITE_CONCERN);

    return appointment;
}

/* ------------------------------------------------------------------ */
/* Update appointment schedule (date/time)                             */
/* ------------------------------------------------------------------ */

export async function updateAppointmentSchedule(id, { date, time }, authUser) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant de rendez-vous invalide.",
        };
    }

    if (!date || !time) {
        throw {
            code: "INVALID_INPUT",
            message: "Les champs 'date' et 'time' sont requis.",
        };
    }

    const [hour] = time.split(":").map(Number);
    if (Number.isNaN(hour) || hour < 8 || hour >= 17) {
        throw {
            code: "INVALID_TIME",
            message: "Le rendez-vous doit être entre 08:00 et 17:00.",
        };
    }

    const appointmentDate = new Date(`${date}T${time}`);
    if (appointmentDate < new Date()) {
        throw {
            code: "INVALID_DATE",
            message: "Impossible de déplacer un rendez-vous dans le passé.",
        };
    }

    const appointment = await Appointment.findOne({
        _id: id,
        ...buildOwnerScope(authUser),
    });

    if (!appointment) {
        throw {
            code: "NOT_FOUND",
            message: "Rendez-vous introuvable.",
        };
    }

    if (appointment.status !== "scheduled") {
        throw {
            code: "STATUS_IMMUTABLE",
            message:
                "Un rendez-vous annulé ou complété ne peut pas être modifié.",
        };
    }

    const conflictQuery = Appointment.findOne({
        _id: { $ne: appointment._id },
        specialist: appointment.specialist,
        date,
        time,
        status: "scheduled",
    });
    const conflict =
        typeof conflictQuery?.lean === "function"
            ? await conflictQuery.lean()
            : await conflictQuery;

    if (conflict) {
        throw {
            code: "SPECIALIST_ALREADY_BOOKED",
            message:
                "Ce créneau est déjà réservé pour ce spécialiste.",
        };
    }

    appointment.date = date;
    appointment.time = time;
    await appointment.save(CLINICAL_WRITE_CONCERN);

    return appointment;
}

/* ------------------------------------------------------------------ */
/* Available slots                                                     */
/* ------------------------------------------------------------------ */

const WORK_START_HOUR = 8;
const WORK_END_HOUR = 17;
const SLOT_STEP_MINUTES = 15;
function formatTime(date) {
    return `${date
        .getHours()
        .toString()
        .padStart(2, "0")}:${date
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;
}

function generateDailySlots() {
    const slots = [];
    for (let h = WORK_START_HOUR; h < WORK_END_HOUR; h++) {
        for (let m = 0; m < 60; m += SLOT_STEP_MINUTES) {
            slots.push(
                `${h.toString().padStart(2, "0")}:${m
                    .toString()
                    .padStart(2, "0")}`
            );
        }
    }
    return slots;
}

async function getSpecialistAvailableTimes(specialist, date) {
    const startOfDay = new Date(`${date}T00:00`);
    const endOfDay = new Date(`${date}T23:59:59.999`);

    if (!mongoose.Types.ObjectId.isValid(specialist)) {
        return new Set();
    }

    const specialistDoc = await Specialist.findById(
        specialist,
        { disponibilites: 1 }
    ).lean();

    const availableTimes = new Set();

    if (!specialistDoc || !Array.isArray(specialistDoc.disponibilites)) {
        return availableTimes;
    }

    specialistDoc.disponibilites.forEach((slot) => {
        const slotDate = new Date(slot);
        if (slotDate >= startOfDay && slotDate <= endOfDay) {
            availableTimes.add(formatTime(slotDate));
        }
    });

    return availableTimes;
}

export async function getAvailableSlots(specialist, date) {
    if (!specialist || !date) {
        throw {
            code: "INVALID_INPUT",
            message:
                "Spécialiste et date sont requis pour les créneaux.",
        };
    }

    if (!mongoose.Types.ObjectId.isValid(specialist)) {
        throw {
            code: "INVALID_INPUT",
            message: "Identifiant de spécialiste invalide.",
        };
    }

    const allSlots = generateDailySlots();
    const specialistTimes = await getSpecialistAvailableTimes(
        specialist,
        date
    );
    if (specialistTimes.size === 0) {
        return [];
    }

    const booked = await Appointment.find(
        { specialist, date, status: "scheduled" },
        { time: 1, _id: 0 }
    ).lean();

    const bookedTimes = new Set(booked.map((a) => a.time));

    const today = new Date();
    const targetDate = new Date(`${date}T00:00`);

    if (targetDate < new Date(today.toDateString())) return [];

    const now = new Date();

    return allSlots.filter((slot) => {
        if (specialistTimes.size > 0 && !specialistTimes.has(slot)) {
            return false;
        }
        if (bookedTimes.has(slot)) return false;

        if (targetDate.toDateString() === now.toDateString()) {
            const slotDate = new Date(`${date}T${slot}`);
            if (slotDate <= now) return false;
        }

        return true;
    });
}

export async function listAppointmentsPaginated({
                                                    page = 1,
                                                    limit = 20,
                                                    specialist,
                                                    status,
                                                    patientInsuranceNumber,
                                                    authUser,
                                                }) {
    const query = buildOwnerScope(authUser);

    if (specialist) query.specialist = specialist;
    if (status) query.status = status;
    if (patientInsuranceNumber)
        query.patientInsuranceNumber = patientInsuranceNumber;

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
        Appointment.find(query)
            .sort({ date: 1, time: 1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Appointment.countDocuments(query),
    ]);

    return {
        data,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}
