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
        enum: ["MEDECIN", "ADMIN", "SUPERADMIN"],
        default: "MEDECIN",
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
    lastLogoutAt: {
        type: Date,
        default: null,
    },
}, { timestamps: true });

export const AdminUser = mongoose.model("AdminUser", AdminUserSchema);
