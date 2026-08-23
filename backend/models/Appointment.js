import mongoose from "mongoose";

/* ------------------------------------------------------------------ */
/* Appointment Schema                                                  */
/* ------------------------------------------------------------------ */

const AppointmentSchema = new mongoose.Schema(
    {
        /** Identifiant patient */
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Patient",
            required: true,
            index: true,
        },

        /** Utilisateur autorisé à accéder au rendez-vous */
        ownerUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AdminUser",
            index: true,
        },

        /** Numéro d'assurance maladie (facultatif, dérivé du patient) */
        patientInsuranceNumber: {
            type: String,
            index: true,
            trim: true,
            default: undefined,
        },

        /** Province ou territoire émetteur au moment du rendez-vous */
        patientInsuranceJurisdiction: {
            type: String,
            default: undefined,
            trim: true,
        },

        /** Spécialiste médical */
        specialist: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Specialist",
            required: true,
            index: true,
        },

        /** Clinique où le rendez-vous est prévu */
        clinique: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Clinique",
            default: null,
            index: true,
        },

        /** Date du rendez-vous (YYYY-MM-DD) */
        date: {
            type: String,
            required: true,
            index: true,
        },

        /** Heure du rendez-vous (HH:mm) */
        time: {
            type: String,
            required: true,
        },

        /** Motif clinique (optionnel) */
        reason: {
            type: String,
            default: "",
        },

        /** Statut du rendez-vous */
        status: {
            type: String,
            enum: ["scheduled", "cancelled", "completed", "no_show", "rescheduled"],
            default: "scheduled",
            index: true,
        },

        /** Motif d'annulation documenté sans détail clinique libre */
        cancellationReason: {
            type: String,
            enum: ["patient", "clinic_emergency"],
            default: undefined,
        },

        /** Chaînage auditable lorsqu'un rendez-vous est reporté */
        rescheduledTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Appointment",
            default: undefined,
        },
        rescheduledFrom: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Appointment",
            default: undefined,
        },

        priority: {
            type: String,
            enum: ["normal", "urgent"],
            default: "normal",
            index: true,
        },

        /** Métadonnées */
        meta: {
            createdBy: {
                type: String,
                default: "clinia-ui",
            },
        },
    },
    {
        timestamps: true,
    }
);

/* ------------------------------------------------------------------ */
/* Index unique pour empêcher le double booking                        */
/* Uniquement pour les rendez-vous "scheduled"                         */
/* ------------------------------------------------------------------ */

AppointmentSchema.index(
    { specialist: 1, date: 1, time: 1 },
    {
        unique: true,
        partialFilterExpression: {
            status: "scheduled",
        },
    }
);

// A patient cannot attend two appointments at the same instant, even with
// different specialists. MongoDB enforces this independently of concurrent
// availability checks performed by separate clinicians.
AppointmentSchema.index(
    { patient: 1, date: 1, time: 1 },
    {
        name: "patient_date_time_scheduled_unique",
        unique: true,
        partialFilterExpression: {
            status: "scheduled",
        },
    }
);

// Supports patient-specific daily scheduling without scanning appointments.
AppointmentSchema.index(
    { patient: 1, specialist: 1, date: 1, status: 1, time: 1 },
    {
        name: "patient_specialist_date_scheduled_time_idx",
        partialFilterExpression: {
            status: "scheduled",
        },
    }
);

export const Appointment =
    mongoose.models.Appointment ||
    mongoose.model("Appointment", AppointmentSchema);
