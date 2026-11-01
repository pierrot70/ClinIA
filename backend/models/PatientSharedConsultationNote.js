import mongoose from "mongoose";

// Append-only entries made under one explicitly authorized care invitation.
const schema = new mongoose.Schema({
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, immutable: true },
    grantId: { type: mongoose.Schema.Types.ObjectId, ref: "ClinicalCareAccessGrant", required: true, immutable: true },
    authorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser", required: true, immutable: true },
    authorRole: { type: String, enum: ["MEDECIN"], required: true, immutable: true },
    authorSpecialty: { type: String, required: true, immutable: true },
    note: { type: String, required: true, maxlength: 20000, immutable: true },
    createdAt: { type: Date, default: Date.now, immutable: true },
});
schema.index({ patientId: 1, createdAt: 1 });
schema.index({ grantId: 1, authorUserId: 1 });
export const PatientSharedConsultationNote = mongoose.models.PatientSharedConsultationNote || mongoose.model("PatientSharedConsultationNote", schema);
