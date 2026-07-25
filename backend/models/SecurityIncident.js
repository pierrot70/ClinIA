import mongoose from "mongoose";

const SecurityIncidentSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            required: true,
            default: "NON_SECURE_CONTENT",
        },
        phase: {
            type: String,
            enum: ["pre_cloud", "post_cloud", "client_enforcement"],
            required: true,
        },
        reason: {
            type: String,
            required: true,
        },
        requestPath: {
            type: String,
            required: true,
        },
        transport: {
            type: String,
            default: "openai_chat_completions",
        },
        matches: {
            type: [Object],
            default: [],
        },
        context: {
            type: Object,
            default: {},
        },
        // SHA-256 fingerprint only. The clinical payload itself is never stored here.
        payloadHash: {
            type: String,
            default: null,
            index: true,
            immutable: true,
        },
        detectedAt: {
            type: Date,
            required: true,
            default: Date.now,
        },
        acknowledged: {
            type: Boolean,
            default: false,
            index: true,
        },
        acknowledgmentAction: {
            type: String,
            default: "",
        },
        acknowledgedAt: {
            type: Date,
            default: null,
        },
        acknowledgmentContext: {
            type: Object,
            default: {},
        },
    },
    { timestamps: true }
);

export const SecurityIncident =
    mongoose.models.SecurityIncident ||
    mongoose.model("SecurityIncident", SecurityIncidentSchema);
