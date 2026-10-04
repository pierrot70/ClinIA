import { recordAuthAuditEvent } from "../../audit/authAudit.js";
import { AdminUser } from "../../models/AdminUser.js";
import { assertSuperAdmin, createAuthError } from "./shared.js";
import { revokeRefreshTokenFamiliesForUser } from "./refreshTokenFamilies.js";
import { hasCurrentAuthVersion } from "../../auth/sessionAccess.js";
import { CLINICAL_WRITE_CONCERN } from "../../db/clinicalWriteConcern.js";
import { getPasswordPolicyViolation } from "../../security/passwordPolicy.js";

// Commit the password and every revocation together. Keep the snapshot filter
// across transaction retries so a stale request cannot overwrite a newer reset.
async function replacePassword(snapshot, passwordHash, temporary, reason, authUser = null) {
    const filter = {
        _id: snapshot._id,
        passwordHash: snapshot.passwordHash,
        authVersion: snapshot.authVersion ?? { $exists: false },
    };
    if (authUser) {
        if (!hasCurrentAuthVersion(snapshot, authUser.authVersion)) {
            throw createAuthError("UNAUTHORIZED", "Session invalide. Reconnectez-vous.");
        }
        if (typeof authUser.sessionId !== "string" || !authUser.sessionId.trim()) {
            throw createAuthError("UNAUTHORIZED", "Session invalide. Reconnectez-vous.");
        }
        Object.assign(filter, {
            isActive: true,
            mustChangePasswordOnNextLogin: true,
            $or: [{ activeSessionId: authUser.sessionId }, { activeSessionIds: authUser.sessionId }],
        });
    }
    return AdminUser.db.transaction(async session => {
        const now = new Date();
        const changed = await AdminUser.findOneAndUpdate(filter, {
            $inc: { authVersion: 1 },
            $set: {
                passwordHash, mustChangePasswordOnNextLogin: temporary,
                passwordResetRequired: false, massDownloadRestrictedUntil: null,
                refreshTokenHash: null, refreshTokenExpiresAt: null,
                activeSessionId: null, activeSessionIds: [],
                sessionStartedAt: null, lastActivityAt: null, lastLogoutAt: now,
                authTokenInvalidBefore: now,
                passwordRecoveryCodeHash: null, passwordRecoveryCodeExpiresAt: null,
                passwordRecoveryCodeAttempts: 0, passwordRecoveryRequestId: null,
                passwordRecoveryGrantHash: null, passwordRecoveryGrantExpiresAt: null,
                mfaChallengeId: null, mfaChallengePurpose: null,
                mfaChallengeExpiresAt: null, mfaChallengeAttempts: 0,
                mfaPendingSecretEncrypted: null, mfaPendingExpiresAt: null,
            },
        }, { session, returnDocument: "after" });
        if (!changed) throw createAuthError("UNAUTHORIZED", "La session ou le mot de passe a changé. Recommencez la demande.");
        await revokeRefreshTokenFamiliesForUser(changed._id, reason, now, { session });
        return changed;
    }, { writeConcern: CLINICAL_WRITE_CONCERN });
}

export async function resetUserPassword({
    userId,
    newPassword,
    authUser,
    req,
    deps,
}) {
    assertSuperAdmin(authUser);

    if (typeof deps?.assertValidUserId !== "function") {
        throw new Error("passwordAdminService requires assertValidUserId dependency");
    }

    deps.assertValidUserId(userId);

    const shouldGenerateTemporaryPassword =
        typeof newPassword === "undefined" ||
        newPassword === null ||
        newPassword === "";
    const nextPassword = shouldGenerateTemporaryPassword
        ? deps.makeTemporaryPassword()
        : newPassword;

    const passwordViolation = getPasswordPolicyViolation(nextPassword);
    if (passwordViolation) {
        throw createAuthError("INVALID_INPUT", passwordViolation);
    }

    const ip = deps.getRequestIp(req);
    let user = await AdminUser.findById(userId);
    if (!user) {
        throw createAuthError("USER_NOT_FOUND", "Utilisateur introuvable.");
    }

    const passwordHash = await deps.hashPassword(nextPassword);
    user = await replacePassword(user, passwordHash, shouldGenerateTemporaryPassword, "PASSWORD_RESET");

    await recordAuthAuditEvent({
        action: "USER_MANAGEMENT",
        outcome: "SUCCESS",
        userId: authUser.userId,
        username: authUser.username,
        actorUsername: authUser.username,
        targetUsername: user.username,
        role: authUser.role,
        ip,
        reason: `RESET_PASSWORD:${String(user._id)}`,
    });

    return {
        user: deps.mapPublicUser(user),
        temporaryPassword: shouldGenerateTemporaryPassword ? nextPassword : null,
    };
}

export async function completeForcedPasswordChange({
    authUser,
    newPassword,
    req,
    deps,
}) {
    if (!authUser?.userId) {
        throw createAuthError("UNAUTHORIZED", "Authentification requise.");
    }

    const passwordViolation = getPasswordPolicyViolation(newPassword);
    if (passwordViolation) {
        throw createAuthError("INVALID_INPUT", passwordViolation);
    }

    const ip = deps.getRequestIp(req);
    let user = await AdminUser.findById(authUser.userId);
    if (!user || user.isActive === false) {
        throw createAuthError(
            "ACCOUNT_INACTIVE",
            "Compte inactif ou inaccessible."
        );
    }

    if (user.mustChangePasswordOnNextLogin !== true) {
        throw createAuthError(
            "FORBIDDEN",
            "Aucun changement de mot de passe obligatoire n'est en attente."
        );
    }

    const passwordHash = await deps.hashPassword(newPassword);
    user = await replacePassword(user, passwordHash, false, "FORCED_PASSWORD_CHANGE", authUser);

    await recordAuthAuditEvent({
        action: "PASSWORD_CHANGE",
        outcome: "SUCCESS",
        userId: user._id,
        username: user.username,
        actorUsername: user.username,
        targetUsername: user.username,
        role: user.role,
        ip,
        reason: "FORCED_PASSWORD_CHANGE_COMPLETED",
    });

    return { success: true };
}
