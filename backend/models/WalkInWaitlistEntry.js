import mongoose from "mongoose";

const WalkInWaitlistEntrySchema = new mongoose.Schema({
    clinic: { type: mongoose.Schema.Types.ObjectId, ref: "Clinique", required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    channel: { type: String, enum: ["sms", "email", "phone"], required: true },
    consentedAt: { type: Date, required: true },
    enrolledBy: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser", required: true },
}, { timestamps: true, collection: "walkinwaitlistentries" });

WalkInWaitlistEntrySchema.index({ clinic: 1, patient: 1 }, { unique: true });

export const WalkInWaitlistEntry = mongoose.models.WalkInWaitlistEntry
    || mongoose.model("WalkInWaitlistEntry", WalkInWaitlistEntrySchema);
