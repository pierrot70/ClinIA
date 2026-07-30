import mongoose from "mongoose";

const LoginFailureThrottleSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AdminUser",
            required: true,
        },
        ipHash: {
            type: String,
            required: true,
        },
        failureCount: {
            type: Number,
            default: 0,
            required: true,
        },
        penaltyLevel: {
            type: Number,
            default: 0,
            required: true,
        },
        lastIncidentPenaltyLevel: {
            type: Number,
            default: 0,
            required: true,
        },
        blockedUntil: {
            type: Date,
            default: null,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
    },
    { timestamps: true }
);

LoginFailureThrottleSchema.index(
    { userId: 1, ipHash: 1 },
    { name: "user_ip_hash_unique", unique: true }
);
LoginFailureThrottleSchema.index(
    { expiresAt: 1 },
    { name: "expires_at_ttl", expireAfterSeconds: 0 }
);

export const LoginFailureThrottle =
    mongoose.models.LoginFailureThrottle ||
    mongoose.model("LoginFailureThrottle", LoginFailureThrottleSchema);
