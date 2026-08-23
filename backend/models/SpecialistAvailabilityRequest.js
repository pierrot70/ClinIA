import mongoose from "mongoose";

// Operational request only: deliberately contains no patient or appointment reference.
const SpecialistAvailabilityRequestSchema = new mongoose.Schema({
    specialist: { type: mongoose.Schema.Types.ObjectId, ref: "Specialist", required: true, index: true },
    clinique: { type: mongoose.Schema.Types.ObjectId, ref: "Clinique", default: null, index: true },
    requestedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser", required: true },
    status: { type: String, enum: ["open", "resolved"], default: "open", index: true },
}, { timestamps: true, collection: "specialistavailabilityrequests" });

SpecialistAvailabilityRequestSchema.index(
    { specialist: 1, clinique: 1 },
    { unique: true, partialFilterExpression: { status: "open" }, name: "specialist_clinic_open_availability_request" }
);

export const SpecialistAvailabilityRequest = mongoose.models.SpecialistAvailabilityRequest || mongoose.model(
    "SpecialistAvailabilityRequest", SpecialistAvailabilityRequestSchema
);
