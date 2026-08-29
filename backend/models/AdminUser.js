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
        enum: ["USER", "RECEPTION", "MEDECIN", "ADMIN", "SUPERADMIN"],
        default: "USER",
        required: true,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    // Reception accounts are limited to one or two explicit clinics. This is
    // an authorization boundary, not a patient-data relationship.
    assignedClinics: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Clinique" }],
        default: [],
        validate: {
            validator(value) {
                return Array.isArray(value) && value.length <= 2;
            },
            message: "Un compte reception peut avoir au plus deux cliniques.",
        },
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
    // Legacy single-session value retained while older issued tokens expire.
    activeSessionId: {
        type: String,
        default: null,
        index: true,
    },
    // Up to two active devices may coexist. The legacy single value above is
    // retained temporarily so sessions issued before this policy remain valid.
    activeSessionIds: {
        type: [String],
        default: [],
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
    mfaEnabled: { type: Boolean, default: false, index: true },
    mfaRequired: { type: Boolean, default: false, index: true },
    mfaSecretEncrypted: { type: String, default: null, select: false },
    mfaPendingSecretEncrypted: { type: String, default: null, select: false },
    mfaPendingExpiresAt: { type: Date, default: null, select: false },
    mfaRecoveryCodeHashes: { type: [String], default: [], select: false },
    // Server-side state makes each MFA challenge single-use and attempt-limited.
    mfaChallengeId: { type: String, default: null, select: false },
    mfaChallengePurpose: { type: String, default: null, select: false },
    mfaChallengeExpiresAt: { type: Date, default: null, select: false },
    mfaChallengeAttempts: { type: Number, default: 0, select: false },
    mfaLockedUntil: { type: Date, default: null },
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
