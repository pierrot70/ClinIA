import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;
function directTransfer() { return this.kind !== "GENERAL"; }
const contactedClinicSchema = new mongoose.Schema({
    clinicId: { type: ObjectId, ref: "Clinique", required: true },
    nom: { type: String, required: true },
    consentRecordedAt: { type: Date, required: true },
}, { _id: false });

const schema = new mongoose.Schema({
    patientId: { type: ObjectId, ref: "Patient", required: true, immutable: true },
    issuerUserId: { type: ObjectId, ref: "AdminUser", required: true, immutable: true },
    issuerRole: { type: String, enum: ["IPS", "MEDECIN"], required: true, immutable: true, default: "IPS" },
    kind: { type: String, enum: ["DIRECT", "GENERAL"], required: true, default: "DIRECT", immutable: true },
    // Only a general invitation acquires its recipient at the moment of acceptance.
    targetUserId: { type: ObjectId, ref: "AdminUser", required: directTransfer },
    // The issuer attests the patient's agreement at submission.
    consentRecordedAt: { type: Date, required: true, immutable: true },
    contactedClinics: { type: [contactedClinicSchema], default: undefined },
    expiresAt: { type: Date, required: directTransfer, immutable: true },
    status: {
        type: String, enum: ["PENDING", "ACCEPTED", "DECLINED", "CANCELLED", "EXPIRED"],
        required: true, default: "PENDING",
    },
    resolvedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ patientId: 1 }, { unique: true, partialFilterExpression: { status: "PENDING" } });
schema.index({ issuerUserId: 1, createdAt: -1 });
schema.index({ targetUserId: 1, createdAt: -1 });

schema.index({ kind: 1, createdAt: 1 }, { partialFilterExpression: { kind: "GENERAL", status: "PENDING" } });

// No TTL index. Consent and the dated decision remain in the transfer history.
export const PatientCareTransfer = mongoose.models.PatientCareTransfer || mongoose.model("PatientCareTransfer", schema);
