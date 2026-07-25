import crypto from "crypto";
import bcrypt from "bcryptjs";

import { recordAuthAuditEvent } from "../audit/authAudit.js";
import { logSafeError } from "../utils/requestLogSafety.js";
import { AdminUser } from "../models/AdminUser.js";
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

    const user = await AdminUser.findOne({
        email: normalizedEmail,
        isActive: true,
    }).select(
        "+passwordRecoveryCodeHash +passwordRecoveryCodeExpiresAt +passwordRecoveryCodeAttempts +passwordRecoveryRequestedAt"
    );

    if (!user) {
        return { accepted: true };
    }

    const code = generateRecoveryCode();
    user.passwordRecoveryCodeHash = hashPasswordRecoveryCode(code);
    user.passwordRecoveryCodeExpiresAt = new Date(
        now.getTime() + PASSWORD_RECOVERY_CODE_TTL_MS
    );
    user.passwordRecoveryCodeAttempts = 0;
    user.passwordRecoveryRequestedAt = now;
    user.passwordRecoveryGrantHash = null;
    user.passwordRecoveryGrantExpiresAt = null;
    await user.save();

    try {
        await sendPasswordRecoveryCode({
            email: normalizedEmail,
            code,
        });
    } catch (err) {
        user.passwordRecoveryCodeHash = null;
        user.passwordRecoveryCodeExpiresAt = null;
        user.passwordRecoveryCodeAttempts = 0;
        await user.save();
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
    now = new Date(),
}) {
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
        "+passwordRecoveryCodeHash +passwordRecoveryCodeExpiresAt +passwordRecoveryCodeAttempts +passwordRecoveryGrantHash +passwordRecoveryGrantExpiresAt"
    );

    if (
        !user?.passwordRecoveryCodeHash ||
        !user.passwordRecoveryCodeExpiresAt ||
        now >= new Date(user.passwordRecoveryCodeExpiresAt) ||
        Number(user.passwordRecoveryCodeAttempts || 0) >=
            PASSWORD_RECOVERY_MAX_CODE_ATTEMPTS
    ) {
        throw createPasswordRecoveryError(
            "INVALID_RECOVERY_CODE",
            "Le code est invalide ou expire."
        );
    }

    const submittedHash = hashPasswordRecoveryCode(normalizedCode);
    if (!valuesMatch(user.passwordRecoveryCodeHash, submittedHash)) {
        user.passwordRecoveryCodeAttempts =
            Number(user.passwordRecoveryCodeAttempts || 0) + 1;
        await user.save();
        throw createPasswordRecoveryError(
            "INVALID_RECOVERY_CODE",
            "Le code est invalide ou expire."
        );
    }

    const grant = crypto.randomBytes(32).toString("base64url");
    user.passwordRecoveryGrantHash = hashPasswordRecoveryGrant(grant);
    user.passwordRecoveryGrantExpiresAt = new Date(
        now.getTime() + PASSWORD_RECOVERY_GRANT_TTL_MS
    );
    user.passwordRecoveryCodeHash = null;
    user.passwordRecoveryCodeExpiresAt = null;
    user.passwordRecoveryCodeAttempts = 0;
    await user.save();

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
    now = new Date(),
}) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedGrant = String(recoveryGrant || "").trim();
    if (
        !normalizedEmail ||
        normalizedGrant.length < 30 ||
        typeof newPassword !== "string" ||
        newPassword.length < 8 ||
        newPassword.length > 128
    ) {
        throw createPasswordRecoveryError(
            "INVALID_PASSWORD_RECOVERY",
            "La demande de reinitialisation est invalide ou expiree."
        );
    }

    const user = await AdminUser.findOne({
        email: normalizedEmail,
        isActive: true,
    }).select(
        "+passwordRecoveryGrantHash +passwordRecoveryGrantExpiresAt +passwordRecoveryCodeHash +passwordRecoveryCodeExpiresAt +passwordRecoveryCodeAttempts"
    );

    if (
        !user?.passwordRecoveryGrantHash ||
        !user.passwordRecoveryGrantExpiresAt ||
        now >= new Date(user.passwordRecoveryGrantExpiresAt) ||
        !valuesMatch(
            user.passwordRecoveryGrantHash,
            hashPasswordRecoveryGrant(normalizedGrant)
        )
    ) {
        throw createPasswordRecoveryError(
            "INVALID_PASSWORD_RECOVERY",
            "La demande de reinitialisation est invalide ou expiree."
        );
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.refreshTokenHash = null;
    user.refreshTokenExpiresAt = null;
    user.sessionStartedAt = null;
    user.lastActivityAt = null;
    user.lastLogoutAt = now;
    user.authTokenInvalidBefore = now;
    user.passwordResetRequired = false;
    user.mustChangePasswordOnNextLogin = false;
    user.passwordRecoveryCodeHash = null;
    user.passwordRecoveryCodeExpiresAt = null;
    user.passwordRecoveryCodeAttempts = 0;
    user.passwordRecoveryGrantHash = null;
    user.passwordRecoveryGrantExpiresAt = null;
    await user.save();

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
