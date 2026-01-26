import mongoose from "mongoose";

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
    },
    {
        timestamps: true,
    }
);

export const Specialist =
    mongoose.models.Specialist ||
    mongoose.model("Specialist", SpecialistSchema);
