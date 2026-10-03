import crypto from "crypto";
import bcrypt from "bcryptjs";

import { recordAuthAuditEvent } from "../audit/authAudit.js";
import { revokeRefreshTokenFamiliesForUser } from "./auth/refreshTokenFamilies.js";
import { logSafeError } from "../utils/requestLogSafety.js";
import { AdminUser } from "../models/AdminUser.js";
import { CLINICAL_WRITE_CONCERN, CLINICAL_QUERY_WRITE_OPTIONS } from "../db/clinicalWriteConcern.js";
import { getPasswordPolicyViolation } from "../security/passwordPolicy.js";
import {
    sendPasswordChangedConfirmation,
    sendPasswordRecoveryCode,
} from "./passwordRecoveryEmail.js";

export const PASSWORD_RECOVERY_CODE_TTL_MS = 10 * 60 * 1000;
export const PASSWORD_RECOVERY_GRANT_TTL_MS = 10 * 60 * 1000;
export const PASSWORD_RECOVERY_MAX_CODE_ATTEMPTS = 5;

function createPasswordRecoveryError(code, message) {
    return { code, message };
}

function getRecoverySecret() {
    const secret =
        process.env.PASSWORD_RECOVERY_SECRET ||
        process.env.JWT_ACCESS_SECRET ||
        process.env.JWT_SECRET;

    if (!secret) {
        throw new Error("PASSWORD_RECOVERY_SECRET is required");
    }

    return secret;
}

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function generateRecoveryCode() {
    return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashPasswordRecoveryValue(value) {
    return crypto
        .createHmac("sha256", getRecoverySecret())
        .update(String(value))
        .digest("hex");
}

export function hashPasswordRecoveryCode(code) {
    return hashPasswordRecoveryValue(`code:${code}`);
}

export function hashPasswordRecoveryGrant(grant) {
    return hashPasswordRecoveryValue(`grant:${grant}`);
}

function valuesMatch(left, right) {
    const leftBuffer = Buffer.from(String(left || ""), "hex");
    const rightBuffer = Buffer.from(String(right || ""), "hex");
    return (
        leftBuffer.length === rightBuffer.length &&
        crypto.timingSafeEqual(leftBuffer, rightBuffer)
    );
}

export async function requestPasswordRecoveryCode({ email, now = new Date() }) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
        return { accepted: true };
    }

    const code = generateRecoveryCode();
    const codeHash = hashPasswordRecoveryCode(code);
    const requestId = crypto.randomUUID();
    const user = await AdminUser.findOneAndUpdate(
        { email: normalizedEmail, isActive: true },
        { $set: {
            passwordRecoveryCodeHash: codeHash,
            passwordRecoveryCodeExpiresAt: new Date(now.getTime() + PASSWORD_RECOVERY_CODE_TTL_MS),
            passwordRecoveryCodeAttempts: 0,
            passwordRecoveryRequestedAt: now,
            passwordRecoveryRequestId: requestId,
            passwordRecoveryGrantHash: null,
            passwordRecoveryGrantExpiresAt: null,
        } },
        { ...CLINICAL_QUERY_WRITE_OPTIONS, returnDocument: "after" },
    );

    if (!user) {
        return { accepted: true };
    }

    try {
        await sendPasswordRecoveryCode({
            email: normalizedEmail,
            code,
        });
    } catch (err) {
        // A delayed failure must not erase a newer request (even if its random
        // six-digit code happens to be identical) or an already issued grant.
        await AdminUser.updateOne(
            { _id: user._id, passwordRecoveryRequestId: requestId, passwordRecoveryCodeHash: codeHash },
            { $set: { passwordRecoveryCodeHash: null, passwordRecoveryCodeExpiresAt: null,
                passwordRecoveryCodeAttempts: 0, passwordRecoveryRequestId: null } },
            CLINICAL_QUERY_WRITE_OPTIONS,
        );
        logSafeError("PASSWORD_RECOVERY_DELIVERY_FAILED", err, {
            component: "email",
        });
        return {
            accepted: true,
            deliveryFailed: true,
        };
    }

    return { accepted: true };
}

export async function verifyPasswordRecoveryCode({
    email,
    code,
    now,
}) {
    const currentTime = () => now ?? new Date();
    const normalizedEmail = normalizeEmail(email);
    const normalizedCode = String(code || "").trim();
    if (!normalizedEmail || !/^\d{6}$/.test(normalizedCode)) {
        throw createPasswordRecoveryError(
            "INVALID_RECOVERY_CODE",
            "Le code est invalide ou expire."
        );
    }

    const user = await AdminUser.findOne({
        email: normalizedEmail,
        isActive: true,
    }).select(
        "+passwordRecoveryCodeHash +passwordRecoveryCodeExpiresAt +passwordRecoveryCodeAttempts +passwordRecoveryRequestId"
    );

    if (
        !user?.passwordRecoveryCodeHash ||
        !user.passwordRecoveryCodeExpiresAt ||
        currentTime() >= new Date(user.passwordRecoveryCodeExpiresAt) ||
        Number(user.passwordRecoveryCodeAttempts || 0) >=
            PASSWORD_RECOVERY_MAX_CODE_ATTEMPTS
    ) {
        throw createPasswordRecoveryError(
            "INVALID_RECOVERY_CODE",
            "Le code est invalide ou expire."
        );
    }

    const claimedAt = currentTime();
    const submittedHash = hashPasswordRecoveryCode(normalizedCode);
    const filter = {
        _id: user._id,
        isActive: true,
        passwordRecoveryRequestId: user.passwordRecoveryRequestId ?? null,
        passwordRecoveryCodeHash: user.passwordRecoveryCodeHash,
        passwordRecoveryCodeExpiresAt: { $gt: claimedAt },
        passwordRecoveryCodeAttempts: { $lt: PASSWORD_RECOVERY_MAX_CODE_ATTEMPTS },
    };
    if (!valuesMatch(user.passwordRecoveryCodeHash, submittedHash)) {
        await AdminUser.updateOne(filter, { $inc: { passwordRecoveryCodeAttempts: 1 } }, CLINICAL_QUERY_WRITE_OPTIONS);
        throw createPasswordRecoveryError(
            "INVALID_RECOVERY_CODE",
            "Le code est invalide ou expire."
        );
    }

    const grant = crypto.randomBytes(32).toString("base64url");
    const claimed = await AdminUser.findOneAndUpdate(filter, { $set: {
        passwordRecoveryGrantHash: hashPasswordRecoveryGrant(grant),
        passwordRecoveryGrantExpiresAt: new Date(claimedAt.getTime() + PASSWORD_RECOVERY_GRANT_TTL_MS),
        passwordRecoveryCodeHash: null,
        passwordRecoveryCodeExpiresAt: null,
        passwordRecoveryCodeAttempts: 0,
        passwordRecoveryRequestId: null,
    } }, { ...CLINICAL_QUERY_WRITE_OPTIONS, returnDocument: "after" });
    if (!claimed) {
        throw createPasswordRecoveryError("INVALID_RECOVERY_CODE", "Le code est invalide ou expire.");
    }

    return {
        verified: true,
        recoveryGrant: grant,
    };
}

export async function completePasswordRecovery({
    email,
    recoveryGrant,
    newPassword,
    ip = null,
    now,
}) {
    const currentTime = () => now ?? new Date();
    const normalizedEmail = normalizeEmail(email);
    const normalizedGrant = String(recoveryGrant || "").trim();
    const passwordViolation = getPasswordPolicyViolation(newPassword);
    if (
        !normalizedEmail ||
        normalizedGrant.length < 30 ||
        passwordViolation
    ) {
        throw createPasswordRecoveryError(
            "INVALID_PASSWORD_RECOVERY",
            "La demande de reinitialisation est invalide ou expiree."
        );
    }

    const snapshot = await AdminUser.findOne({
        email: normalizedEmail,
        isActive: true,
    }).select(
        "+passwordRecoveryGrantHash +passwordRecoveryGrantExpiresAt +passwordRecoveryCodeHash +passwordRecoveryCodeExpiresAt +passwordRecoveryCodeAttempts"
    );

    if (
        !snapshot?.passwordRecoveryGrantHash ||
        !snapshot.passwordRecoveryGrantExpiresAt ||
        currentTime() >= new Date(snapshot.passwordRecoveryGrantExpiresAt) ||
        !valuesMatch(
            snapshot.passwordRecoveryGrantHash,
            hashPasswordRecoveryGrant(normalizedGrant)
        )
    ) {
        throw createPasswordRecoveryError(
            "INVALID_PASSWORD_RECOVERY",
            "La demande de reinitialisation est invalide ou expiree."
        );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    // Password, one-use grant, session generation and refresh-family revocation
    // commit together. No email/audit side effect inside a retriable transaction.
    const user = await AdminUser.db.transaction(async (session) => {
        const completedAt = currentTime();
        const changed = await AdminUser.findOneAndUpdate({
            _id: snapshot._id,
            isActive: true,
            passwordHash: snapshot.passwordHash,
            passwordRecoveryGrantHash: snapshot.passwordRecoveryGrantHash,
            passwordRecoveryGrantExpiresAt: { $gt: completedAt },
        }, {
            $inc: { authVersion: 1 },
            $set: {
                passwordHash, refreshTokenHash: null, refreshTokenExpiresAt: null,
                activeSessionId: null, activeSessionIds: [],
                sessionStartedAt: null, lastActivityAt: null, lastLogoutAt: completedAt,
                authTokenInvalidBefore: completedAt, passwordResetRequired: false,
                mustChangePasswordOnNextLogin: false,
                passwordRecoveryCodeHash: null, passwordRecoveryCodeExpiresAt: null,
                passwordRecoveryCodeAttempts: 0, passwordRecoveryRequestId: null,
                passwordRecoveryGrantHash: null, passwordRecoveryGrantExpiresAt: null,
                mfaChallengeId: null, mfaChallengePurpose: null,
                mfaChallengeExpiresAt: null, mfaChallengeAttempts: 0,
                mfaPendingSecretEncrypted: null, mfaPendingExpiresAt: null,
            },
        }, { session, returnDocument: "after" });
        if (!changed) {
            throw createPasswordRecoveryError("INVALID_PASSWORD_RECOVERY", "La demande de reinitialisation est invalide ou expiree.");
        }
        await revokeRefreshTokenFamiliesForUser(changed._id, "PASSWORD_RECOVERY_COMPLETED", completedAt, { session });
        return changed;
    }, { writeConcern: CLINICAL_WRITE_CONCERN });

    await recordAuthAuditEvent({
        action: "PASSWORD_CHANGE",
        outcome: "SUCCESS",
        userId: user._id,
        username: user.username,
        actorUsername: user.username,
        targetUsername: user.username,
        role: user.role,
        ip,
        reason: "PASSWORD_RECOVERY_COMPLETED",
    });

    try {
        await sendPasswordChangedConfirmation({
            email: normalizedEmail,
        });
    } catch (err) {
        logSafeError("PASSWORD_CHANGE_CONFIRMATION_DELIVERY_FAILED", err, {
            component: "email",
        });
    }

    return { success: true };
}
