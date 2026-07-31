import mongoose from "mongoose";

// Stores only scheduling keys so the daily appointment limit is enforced atomically.
const AppointmentBookingGuardSchema = new mongoose.Schema(
    {
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Patient",
            required: true,
        },
        specialist: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Specialist",
            required: true,
        },
        date: {
            type: String,
            required: true,
        },
        scheduledCount: {
            type: Number,
            required: true,
            default: 0,
            min: 0,
        },
    },
    { timestamps: true }
);

AppointmentBookingGuardSchema.index(
    { patient: 1, specialist: 1, date: 1 },
    { name: "patient_specialist_day_unique", unique: true }
);

export const AppointmentBookingGuard =
    mongoose.models.AppointmentBookingGuard ||
    mongoose.model("AppointmentBookingGuard", AppointmentBookingGuardSchema);
