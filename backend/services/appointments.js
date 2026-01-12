import { Appointment } from "../models/Appointment.js";
import mongoose from "mongoose";

/* ------------------------------------------------------------------ */
/* Service Appointment                                                 */
/* ------------------------------------------------------------------ */

export async function createAppointment(dto) {
    /* ---------------- Validation métier ---------------- */

    const ALLOWED_PRIORITIES = ["normal", "urgent"];

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

    /* -------------------------------------------------- */
    /* RÈGLE MÉTIER MAJEURE                               */
    /* Un patient = un seul rendez-vous par spécialité   */
    /* -------------------------------------------------- */

    const existing = await Appointment.findOne({
        patientInsuranceNumber: dto.patientInsuranceNumber,
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

    return Appointment.create(dto);
}

/* ------------------------------------------------------------------ */
/* GET appointments                                                    */
/* ------------------------------------------------------------------ */

export async function listAppointments(filters = {}) {
    const query = {};

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

export async function getAppointmentById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant de rendez-vous invalide.",
        };
    }

    const appointment = await Appointment.findById(id).lean();

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

export async function cancelAppointment(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant de rendez-vous invalide.",
        };
    }

    const appointment = await Appointment.findById(id);

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
    await appointment.save();

    return appointment;
}

/* ------------------------------------------------------------------ */
/* Update appointment status                                           */
/* ------------------------------------------------------------------ */

const ALLOWED_STATUSES = ["scheduled", "cancelled", "completed"];

export async function updateAppointmentStatus(id, newStatus) {
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

    const appointment = await Appointment.findById(id);

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
    await appointment.save();

    return appointment;
}

/* ------------------------------------------------------------------ */
/* Available slots                                                     */
/* ------------------------------------------------------------------ */

const WORK_START_HOUR = 8;
const WORK_END_HOUR = 17;
const SLOT_STEP_MINUTES = 15;

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

export async function getAvailableSlots(specialist, date) {
    if (!specialist || !date) {
        throw {
            code: "INVALID_INPUT",
            message:
                "Spécialiste et date sont requis pour les créneaux.",
        };
    }

    const allSlots = generateDailySlots();

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
        if (bookedTimes.has(slot)) return false;

        if (targetDate.toDateString() === now.toDateString()) {
            const slotDate = new Date(`${date}T${slot}`);
            if (slotDate <= now) return false;
        }

        return true;
    });
}
