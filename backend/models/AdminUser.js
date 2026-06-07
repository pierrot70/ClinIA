import mongoose from "mongoose";

const AdminUserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    email: {
        type: String,
        default: null,
        unique: true,
        sparse: true,
        lowercase: true,
        trim: true,
    },
    passwordHash: { type: String, required: true },
    role: {
        type: String,
        enum: ["USER", "MEDECIN", "ADMIN", "SUPERADMIN"],
        default: "USER",
        required: true,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    refreshTokenHash: {
        type: String,
        default: null,
        index: true,
    },
    refreshTokenExpiresAt: {
        type: Date,
        default: null,
    },
    failedLoginAttempts: {
        type: Number,
        default: 0,
    },
    lockUntil: {
        type: Date,
        default: null,
    },
    lastLoginAt: {
        type: Date,
        default: null,
    },
    sessionStartedAt: {
        type: Date,
        default: null,
    },
    lastActivityAt: {
        type: Date,
        default: null,
    },
    lastLogoutAt: {
        type: Date,
        default: null,
    },
    clinicianCommentsInboxSeenAt: {
        type: Date,
        default: null,
    },
    authTokenInvalidBefore: {
        type: Date,
        default: null,
        index: true,
    },
    massDownloadRestrictedUntil: {
        type: Date,
        default: null,
        index: true,
    },
    passwordResetRequired: {
        type: Boolean,
        default: false,
        index: true,
    },
    mustChangePasswordOnNextLogin: {
        type: Boolean,
        default: false,
        index: true,
    },
    passwordRecoveryCodeHash: {
        type: String,
        default: null,
        select: false,
    },
    passwordRecoveryCodeExpiresAt: {
        type: Date,
        default: null,
        select: false,
    },
    passwordRecoveryCodeAttempts: {
        type: Number,
        default: 0,
        select: false,
    },
    passwordRecoveryRequestedAt: {
        type: Date,
        default: null,
        select: false,
    },
    passwordRecoveryGrantHash: {
        type: String,
        default: null,
        select: false,
    },
    passwordRecoveryGrantExpiresAt: {
        type: Date,
        default: null,
        select: false,
    },
}, { timestamps: true });

export const AdminUser = mongoose.model("AdminUser", AdminUserSchema);
