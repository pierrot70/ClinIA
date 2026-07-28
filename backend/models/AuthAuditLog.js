import mongoose from "mongoose";

const AuthAuditLogSchema = new mongoose.Schema(
    {
        action: {
            type: String,
            enum: [
                "LOGIN",
                "FAILED_LOGIN",
                "LOGOUT",
                "REGISTER",
                "USER_MANAGEMENT",
                "PASSWORD_CHANGE",
                "REFRESH_TOKEN_REPLAY",
                "CONCURRENT_SESSION_REPLACED",
                "SESSION_LIMIT_REACHED",
                "MFA_LOGIN",
                "MFA_ENROLLED",
                "MFA_RECOVERY_CODE_USED",
                "MFA_FAILED",
            ],
            required: true,
        },
        outcome: {
            type: String,
            enum: ["SUCCESS", "FAILED"],
            required: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AdminUser",
            default: null,
        },
        usernameMasked: {
            type: String,
            default: "unknown",
        },
        actorUsername: {
            type: String,
            default: null,
        },
        targetUsername: {
            type: String,
            default: null,
        },
        role: {
            type: String,
            default: null,
        },
        ip: {
            type: String,
            default: null,
        },
        reason: {
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

AuthAuditLogSchema.index({ action: 1, timestamp: -1 });

export const AuthAuditLog =
    mongoose.models.AuthAuditLog ||
    mongoose.model("AuthAuditLog", AuthAuditLogSchema);
