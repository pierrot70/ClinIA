import mongoose from "mongoose";

const ClinicalTermRequestSchema = new mongoose.Schema(
    {
        field: { type: String, enum: ["symptoms"], required: true, index: true },
        // This is a short controlled clinical concept, never a patient note.
        proposedTerm: { type: String, required: true, trim: true, maxlength: 80 },
        normalizedTerm: { type: String, required: true, index: true },
        status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED"],
            default: "PENDING",
            index: true,
        },
        requestedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser", required: true, index: true },
        decidedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser", default: null },
        decidedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

ClinicalTermRequestSchema.index(
    { field: 1, normalizedTerm: 1, status: 1 },
    { unique: true, partialFilterExpression: { status: "PENDING" } }
);

export const ClinicalTermRequest = mongoose.models.ClinicalTermRequest ||
    mongoose.model("ClinicalTermRequest", ClinicalTermRequestSchema);
