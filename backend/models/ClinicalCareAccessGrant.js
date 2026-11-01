import mongoose from "mongoose";

// A per-patient invitation, never a platform role or permanent ownership grant.
const schema = new mongoose.Schema({
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, immutable: true },
    issuerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser", required: true, immutable: true },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser", required: true, immutable: true },
    permission: { type: String, enum: ["READ_APPEND"], default: "READ_APPEND", required: true, immutable: true },
    status: { type: String, enum: ["ACTIVE", "REVOKED", "EXPIRED"], default: "ACTIVE", required: true },
    expiresAt: { type: Date, required: true, immutable: true },
    revokedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ patientId: 1, issuerUserId: 1, targetUserId: 1 }, { unique: true, partialFilterExpression: { status: "ACTIVE" } });
schema.index({ targetUserId: 1, status: 1, expiresAt: 1 });
// No TTL deletion: invitations, revocations and associated clinical notes remain.
export const ClinicalCareAccessGrant = mongoose.models.ClinicalCareAccessGrant || mongoose.model("ClinicalCareAccessGrant", schema);
