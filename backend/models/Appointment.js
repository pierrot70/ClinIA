import mongoose from "mongoose";

/* ------------------------------------------------------------------ */
/* Appointment Schema                                                  */
/* ------------------------------------------------------------------ */

const AppointmentSchema = new mongoose.Schema(
    {
        /** Identifiant patient (TEMPORAIRE, non sécurisé) */
        patientInsuranceNumber: {
            type: String,
            required: true,
            index: true,
            trim: true,
        },

        /** Spécialité médicale */
        specialist: {
            type: String,
            required: true,
            index: true,
            trim: true,
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
            enum: ["scheduled", "cancelled", "completed"],
            default: "scheduled",
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
        partialFilterExpression: { status: "scheduled" },
    }
);

export const Appointment =
    mongoose.models.Appointment ||
    mongoose.model("Appointment", AppointmentSchema);
