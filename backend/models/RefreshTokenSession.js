import mongoose from "mongoose";

export const REFRESH_TOKEN_SESSION_STATUS = {
    ACTIVE: "ACTIVE",
    ROTATED: "ROTATED",
    REVOKED: "REVOKED",
    EXPIRED: "EXPIRED",
};

const RefreshTokenSessionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AdminUser",
            required: true,
        },
        familyId: {
            type: String,
            required: true,
        },
        sessionId: {
            type: String,
            default: null,
        },
        tokenHash: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: Object.values(REFRESH_TOKEN_SESSION_STATUS),
            default: REFRESH_TOKEN_SESSION_STATUS.ACTIVE,
            required: true,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
        rotatedAt: {
            type: Date,
            default: null,
        },
        revokedAt: {
            type: Date,
            default: null,
        },
        revocationReason: {
            type: String,
            default: null,
        },
        lastUsedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

RefreshTokenSessionSchema.index(
    { tokenHash: 1 },
    { name: "token_hash_unique", unique: true }
);
RefreshTokenSessionSchema.index(
    { familyId: 1, status: 1 },
    { name: "family_status" }
);
RefreshTokenSessionSchema.index(
    { userId: 1, status: 1 },
    { name: "user_status" }
);
RefreshTokenSessionSchema.index(
    { userId: 1, sessionId: 1, status: 1 },
    { name: "user_session_status" }
);
RefreshTokenSessionSchema.index(
    { expiresAt: 1 },
    { name: "expires_at_ttl", expireAfterSeconds: 0 }
);

export const RefreshTokenSession =
    mongoose.models.RefreshTokenSession ||
    mongoose.model("RefreshTokenSession", RefreshTokenSessionSchema);
