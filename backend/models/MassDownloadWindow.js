import mongoose from "mongoose";

const MassDownloadWindowSchema = new mongoose.Schema(
    {
        detectorKey: {
            type: String,
            required: true,
            index: true,
        },
        actorKey: {
            type: String,
            required: true,
            index: true,
        },
        userId: {
            type: String,
            default: "anonymous",
        },
        username: {
            type: String,
            default: null,
        },
        role: {
            type: String,
            default: null,
        },
        ip: {
            type: String,
            default: "unknown",
        },
        windowStartedAt: {
            type: Date,
            required: true,
            index: true,
        },
        windowMs: {
            type: Number,
            required: true,
        },
        totalCost: {
            type: Number,
            default: 0,
        },
        incidentsCreated: {
            type: Number,
            default: 0,
        },
        lastIncidentAt: {
            type: Date,
            default: null,
        },
        expiresAt: {
            type: Date,
            required: true,
            index: { expires: 0 },
        },
    },
    { timestamps: true }
);

MassDownloadWindowSchema.index(
    { detectorKey: 1, actorKey: 1, windowStartedAt: 1 },
    { unique: true }
);

export const MassDownloadWindow =
    mongoose.models.MassDownloadWindow ||
    mongoose.model("MassDownloadWindow", MassDownloadWindowSchema);
