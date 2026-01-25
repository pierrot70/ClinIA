import mongoose from "mongoose";

/* ------------------------------------------------------------------ */
/* Clinique Schema                                                    */
/* ------------------------------------------------------------------ */

const CliniqueSchema = new mongoose.Schema(
    {
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
    },
    {
        timestamps: true,
    }
);

export const Clinique =
    mongoose.models.Clinique ||
    mongoose.model("Clinique", CliniqueSchema);
