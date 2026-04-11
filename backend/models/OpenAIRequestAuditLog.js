import mongoose from "mongoose";

const OpenAIRequestAuditLogSchema = new mongoose.Schema(
    {
        action: {
            type: String,
            enum: ["AI_ANALYZE_REQUEST"],
            required: true,
        },
        outcome: {
            type: String,
            enum: ["SENT", "SUCCESS", "FAILED"],
            required: true,
            index: true,
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
        requestPath: {
            type: String,
            required: true,
        },
        transport: {
            type: String,
            default: "openai_chat_completions",
        },
        model: {
            type: String,
            required: true,
        },
        payloadHash: {
            type: String,
            required: true,
            index: true,
        },
        payloadSizeBytes: {
            type: Number,
            default: 0,
        },
        dataClassification: {
            type: String,
            enum: ["ANONYMIZED_MEDICAL"],
            default: "ANONYMIZED_MEDICAL",
        },
        requestContext: {
            type: Object,
            default: {},
        },
        acknowledgmentIncidentId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        neutralized: {
            type: Boolean,
            default: false,
        },
        upstreamRequestId: {
            type: String,
            default: null,
        },
        errorCode: {
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

OpenAIRequestAuditLogSchema.index({ action: 1, timestamp: -1 });

export const OpenAIRequestAuditLog =
    mongoose.models.OpenAIRequestAuditLog ||
    mongoose.model("OpenAIRequestAuditLog", OpenAIRequestAuditLogSchema);