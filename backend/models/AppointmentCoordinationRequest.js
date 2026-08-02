import mongoose from "mongoose";

const AppointmentCoordinationRequestSchema = new mongoose.Schema(
    {
        patient: {
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
        specialty: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
        },
        status: {
            type: String,
            enum: ["open", "resolved", "cancelled"],
            default: "open",
            index: true,
        },
        requestedByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AdminUser",
            required: true,
        },
    },
    {
        timestamps: true,
        collection: "appointmentcoordinationrequests",
    }
);

// One active request per patient and specialty avoids duplicate coordination
// work when a physician retries the action.
AppointmentCoordinationRequestSchema.index(
    { patient: 1, specialty: 1 },
    {
        name: "patient_specialty_open_unique",
        unique: true,
        partialFilterExpression: { status: "open" },
    }
);

export const AppointmentCoordinationRequest =
    mongoose.models.AppointmentCoordinationRequest ||
    mongoose.model(
        "AppointmentCoordinationRequest",
        AppointmentCoordinationRequestSchema
    );
