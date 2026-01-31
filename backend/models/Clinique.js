import mongoose from "mongoose";

/* ------------------------------------------------------------------ */
/* Clinique Schema                                                    */
/* ------------------------------------------------------------------ */

const CliniqueSchema = new mongoose.Schema(
    {
        nom: {
            type: String,
            required: true,
            trim: true,
        },
        num_civique: {
            type: String,
            required: true,
            trim: true,
        },
        rue: {
            type: String,
            required: true,
            trim: true,
        },
        code_postal: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
        },
        lat: {
            type: Number,
        },
        long: {
            type: Number,
        },
        telephone: {
            type: String,
            trim: true,
            default: undefined,
        },
        courriel: {
            type: String,
            trim: true,
            lowercase: true,
            default: undefined,
        },
    },
    {
        timestamps: true,
    }
);

export const Clinique =
    mongoose.models.Clinique ||
    mongoose.model("Clinique", CliniqueSchema);
