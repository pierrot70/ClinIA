import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
    patientId: { type: ObjectId, ref: "Patient", required: true, immutable: true },
    issuerUserId: { type: ObjectId, ref: "AdminUser", required: true, immutable: true },
    targetUserId: { type: ObjectId, ref: "AdminUser", required: true, immutable: true },
    // The issuer attests the patient's agreement at submission.
    consentRecordedAt: { type: Date, required: true, immutable: true },
    expiresAt: { type: Date, required: true, immutable: true },
    status: {
        type: String, enum: ["PENDING", "ACCEPTED", "DECLINED", "CANCELLED", "EXPIRED"],
        required: true, default: "PENDING",
    },
    resolvedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ patientId: 1 }, { unique: true, partialFilterExpression: { status: "PENDING" } });
schema.index({ issuerUserId: 1, createdAt: -1 });
schema.index({ targetUserId: 1, createdAt: -1 });

// No TTL index. Consent and the dated decision remain in the transfer history.
export const PatientCareTransfer = mongoose.models.PatientCareTransfer || mongoose.model("PatientCareTransfer", schema);
