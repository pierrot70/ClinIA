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

export const AuthAuditLog =
    mongoose.models.AuthAuditLog ||
    mongoose.model("AuthAuditLog", AuthAuditLogSchema);
