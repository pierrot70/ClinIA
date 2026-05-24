import mongoose from "mongoose";

const DiagnosisResultSchema = new mongoose.Schema(
    {
        fingerprint: {
            type: String,
            required: true,
            unique: true, // 🔒 clé anti-doublon
            index: true,
        },

        input: {
            type: Object,
            required: true,
        },

        output: {
            type: Object,
            required: true,
        },

        mode: {
            type: String,
            enum: ["mock", "real"],
            required: true,
        },

        model: {
            type: String,
        },

        history: [
            {
                status: {
                    type: String,
                    enum: ["DELETE"],
                    required: true,
                },
                archivedAt: {
                    type: Date,
                    required: true,
                },
                archivedBy: {
                    userId: { type: String, default: null },
                    username: { type: String, default: null },
                    role: { type: String, default: null },
                },
                input: {
                    type: Object,
                    required: true,
                },
                output: {
                    type: Object,
                    required: true,
                },
                mode: {
                    type: String,
                    enum: ["mock", "real"],
                    required: true,
                },
                model: {
                    type: String,
                },
            },
        ],
    },
    { timestamps: true }
);

export const DiagnosisResult = mongoose.model(
    "DiagnosisResult",
    DiagnosisResultSchema
);
