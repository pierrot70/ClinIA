import mongoose from "mongoose";

const PatientAuditLogSchema = new mongoose.Schema(
    {
        action: {
            type: String,
            enum: [
                "PATIENT_CREATE",
                "PATIENT_UPDATE",
                "PATIENT_DELETE",
            ],
            required: true,
        },
        outcome: {
            type: String,
            enum: ["SUCCESS", "FAILED"],
            required: true,
        },
        actorUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AdminUser",
            default: null,
        },
        actorUsernameMasked: {
            type: String,
            default: "unknown",
        },
        actorRole: {
            type: String,
            default: null,
        },
        ip: {
            type: String,
            default: null,
        },
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Patient",
            default: null,
            index: true,
        },
        changedFields: {
            type: [String],
            default: [],
        },
        requestPath: {
            type: String,
            default: null,
        },
        timestamp: {
            type: Date,
            required: true,
            default: Date.now,
            index: true,
        },
    },
    { timestamps: true }
);

PatientAuditLogSchema.index({ action: 1, timestamp: -1 });

export const PatientAuditLog =
    mongoose.models.PatientAuditLog ||
    mongoose.model("PatientAuditLog", PatientAuditLogSchema);