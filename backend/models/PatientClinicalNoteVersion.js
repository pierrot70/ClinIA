import mongoose from "mongoose";

const PatientClinicalNoteVersionSchema = new mongoose.Schema(
    {
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Patient",
            required: true,
            index: true,
        },
        ownerUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AdminUser",
            required: true,
            index: true,
        },
        version: {
            type: Number,
            required: true,
            min: 1,
        },
        note: {
            type: String,
            required: true,
            default: "",
        },
        contentHash: {
            type: String,
            required: true,
            maxlength: 128,
        },
        changeType: {
            type: String,
            enum: ["BASELINE", "UPDATE", "RESTORE"],
            required: true,
        },
        restoredFromVersionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PatientClinicalNoteVersion",
            default: null,
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
    },
    { timestamps: true, collection: "patientclinicalnoteversions" }
);

PatientClinicalNoteVersionSchema.index({ patientId: 1, version: -1 }, { unique: true });
PatientClinicalNoteVersionSchema.index({ ownerUserId: 1, patientId: 1, createdAt: -1 });

export const PatientClinicalNoteVersion =
    mongoose.models.PatientClinicalNoteVersion ||
    mongoose.model("PatientClinicalNoteVersion", PatientClinicalNoteVersionSchema);
