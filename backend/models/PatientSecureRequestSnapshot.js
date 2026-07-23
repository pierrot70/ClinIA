import mongoose from "mongoose";

// Product data used to resume a patient's approved clinical request. This is
// deliberately separate from technical audit logs.
const PatientSecureRequestSnapshotSchema = new mongoose.Schema(
    {
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Patient",
            required: true,
            index: true,
        },
        clinicalScope: { type: String, required: true, trim: true, maxlength: 160 },
        clinicalScopeKey: { type: String, required: true, trim: true, maxlength: 160 },
        objective: { type: String, default: "", trim: true, maxlength: 500 },
        selectedDocumentIds: { type: [String], default: [] },
        source: { type: String, default: "patient_profile" },
    },
    { timestamps: true }
);

PatientSecureRequestSnapshotSchema.index(
    { patientId: 1, clinicalScopeKey: 1 },
    { unique: true }
);

export const PatientSecureRequestSnapshot =
    mongoose.models.PatientSecureRequestSnapshot ||
    mongoose.model("PatientSecureRequestSnapshot", PatientSecureRequestSnapshotSchema);
