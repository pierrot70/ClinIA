import mongoose from "mongoose";

/* ------------------------------------------------------------------ */
/* Patient Schema                                                      */
/* ------------------------------------------------------------------ */

const PatientSchema = new mongoose.Schema(
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
        num_assurance_maladie: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true,
        },
        addresse: {
            type: String,
            default: "",
            trim: true,
        },
        telephone: {
            type: String,
            default: "",
            trim: true,
        },
        courriel: {
            type: String,
            default: "",
            trim: true,
            lowercase: true,
        },
        texto: {
            type: Boolean,
            default: false,
        },
        lat: {
            type: Number,
        },
        long: {
            type: Number,
        },
    },
    {
        timestamps: true,
    }
);

export const Patient =
    mongoose.models.Patient ||
    mongoose.model("Patient", PatientSchema);
