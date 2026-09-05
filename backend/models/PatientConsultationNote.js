import mongoose from "mongoose";

// Append-only clinical entries. No public update/delete endpoint is exposed.
const schema = new mongoose.Schema({
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, immutable: true },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", required: true, immutable: true },
    authorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser", required: true, immutable: true },
    note: { type: String, required: true, maxlength: 20000, immutable: true },
    createdAt: { type: Date, default: Date.now, immutable: true },
});
schema.index({ patientId: 1, createdAt: 1 });
schema.index({ appointmentId: 1, authorUserId: 1 });
export const PatientConsultationNote = mongoose.models.PatientConsultationNote ||
    mongoose.model("PatientConsultationNote", schema);
