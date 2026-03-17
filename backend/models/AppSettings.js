import mongoose from "mongoose";

/**
 * Singleton document for global application settings.
 * Only ONE document with key "main" should exist in this collection.
 */
const AppSettingsSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        default: "main",
    },
    // Maintenance / shutdown state
    maintenanceIsScheduled: { type: Boolean, default: false },
    maintenanceShutdownAt: { type: Date, default: null },
    maintenanceActivatedAt: { type: Date, default: null },
    maintenanceActivatedBy: { type: String, default: null },
    maintenanceDelaySeconds: { type: Number, default: null },
    maintenanceEnforcedAt: { type: Date, default: null },
}, {
    timestamps: true,
});

export const AppSettings = mongoose.model("AppSettings", AppSettingsSchema);
