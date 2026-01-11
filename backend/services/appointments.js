import { Appointment } from "../models/Appointment.js";
import mongoose from "mongoose";

/* ------------------------------------------------------------------ */
/* Service Appointment                                                 */
/* ------------------------------------------------------------------ */

export async function createAppointment(dto) {
    /* ---------------- Validation métier ---------------- */

    // Exemple 1 : heures ouvrables
    const [hour, minute] = dto.time.split(":").map(Number);

    if (hour < 8 || hour >= 17) {
        throw {
            code: "INVALID_TIME",
            message: "Le rendez-vous doit être entre 08:00 et 17:00.",
        };
    }

    // Exemple 2 : date passée
    const today = new Date();
    const appointmentDate = new Date(`${dto.date}T${dto.time}`);

    if (appointmentDate < today) {
        throw {
            code: "INVALID_DATE",
            message: "Impossible de créer un rendez-vous dans le passé.",
        };
    }

    /* ---------------- Persistance ---------------- */

    // 👉 C’est ICI que l’Entity est utilisée
    return Appointment.create(dto);
}

/* ------------------------------------------------------------------ */
/* GET appointments (service)                                         */
/* ------------------------------------------------------------------ */

export async function listAppointments(filters = {}) {
    const query = {};

    if (filters.specialist) {
        query.specialist = filters.specialist;
    }

    if (filters.date) {
        query.date = filters.date;
    }

    if (filters.patientInsuranceNumber) {
        query.patientInsuranceNumber =
            filters.patientInsuranceNumber;
    }

    return Appointment.find(query)
        .sort({ date: 1, time: 1 })
        .lean();
}


/* ------------------------------------------------------------------ */
/* GET appointment by id (service)                                     */
/* ------------------------------------------------------------------ */

export async function getAppointmentById(id) {
    // Validation métier minimale
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
/* GET appointment by par numero de RAMQ                              */
/*   Validation: Un individu peut avoir qu'un seul appointment par    */
/*               categorie.                                           */
/* ------------------------------------------------------------------ */