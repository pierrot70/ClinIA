import mongoose from "mongoose";
const schema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    action: { type: String, enum: ["LIST", "DOWNLOAD"], required: true },
    runId: { type: String, default: null },
    format: { type: String, enum: ["pdf", "bundle", null], default: null },
    ip: { type: String, default: null },
    timestamp: { type: Date, default: Date.now, required: true },
}, { versionKey: false });
schema.index({ timestamp: -1 });
export const ValidationReportAudit = mongoose.models.ValidationReportAudit || mongoose.model("ValidationReportAudit", schema);
