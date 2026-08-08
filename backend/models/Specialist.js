import mongoose from "mongoose";

const PracticeLocationSchema = new mongoose.Schema(
    {
        clinique: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Clinique",
            required: true,
        },
        disponibilites: [{ type: Date }],
    },
    { _id: false }
);

/* ------------------------------------------------------------------ */
/* Specialist Schema                                                   */
/* ------------------------------------------------------------------ */

const SpecialistSchema = new mongoose.Schema(
    {
        nom: {
            type: String,
            required: true,
            trim: true,
        },
        prenom: {
            type: String,
            required: true,
            trim: true,
        },
        numero_medecin: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true,
        },
        specialite: {
            type: String,
            trim: true,
            default: undefined,
        },
        telephone: {
            type: String,
            trim: true,
            default: undefined,
        },
        email: {
            type: String,
            trim: true,
            lowercase: true,
            default: "",
        },
        texto: {
            type: Boolean,
            default: false,
        },
        clinique_associer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Clinique",
        },
        disponibilites: [
            {
                type: Date,
            },
        ],
        // New scheduling source of truth. Legacy fields above remain during
        // the compatibility window for existing API consumers and data.
        practiceLocations: {
            type: [PracticeLocationSchema],
            default: undefined,
        },
    },
    {
        timestamps: true,
    }
);

export const Specialist =
    mongoose.models.Specialist ||
    mongoose.model("Specialist", SpecialistSchema);
