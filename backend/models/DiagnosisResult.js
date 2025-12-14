import mongoose from "mongoose";

const DiagnosisResultSchema = new mongoose.Schema(
    {
        input: {
            type: Object,
            required: true, // symptômes, contexte, etc.
        },

        output: {
            type: Object,
            required: true, // réponse structurée IA
        },

        mode: {
            type: String,
            enum: ["mock", "real"],
            required: true,
        },

        model: {
            type: String, // ex: gpt-4.1-mini
        },
    },
    {
        timestamps: true, // createdAt / updatedAt
    }
);

export const DiagnosisResult = mongoose.model(
    "DiagnosisResult",
    DiagnosisResultSchema
);
