import mongoose from "mongoose";

const ClinicalSupportAccessRequestSchema = new mongoose.Schema(
    {
        patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
        physicianUserId: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser", required: true, index: true },
        requestedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser", default: null, index: true },
        // Codes avoid putting clinical or identifying information in a support request.
        reasonCode: {
            type: String,
            enum: ["TECHNICAL_SUPPORT", "SECURITY_INCIDENT", "DATA_ACCESS_REQUEST"],
            required: true,
        },
        superadminJustificationCode: {
            type: String,
            enum: ["TECHNICAL_SUPPORT", "SECURITY_INCIDENT", "DATA_ACCESS_REQUEST"],
            default: null,
        },
        status: { type: String, enum: ["OPEN", "PENDING", "APPROVED", "REJECTED", "REVOKED", "EXPIRED"], default: "OPEN", index: true },
        approvedAt: { type: Date, default: null },
        approvedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser", default: null },
        expiresAt: { type: Date, default: null },
        revokedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

ClinicalSupportAccessRequestSchema.index(
    { patientId: 1, requestedByUserId: 1, status: 1 },
    { unique: true, partialFilterExpression: { status: "PENDING" } }
);

export const ClinicalSupportAccessRequest = mongoose.models.ClinicalSupportAccessRequest ||
    mongoose.model("ClinicalSupportAccessRequest", ClinicalSupportAccessRequestSchema);
