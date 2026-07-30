import { recordAuthAuditEvent } from "../../audit/authAudit.js";
import { AdminUser } from "../../models/AdminUser.js";
import { assertSuperAdmin, createAuthError } from "./shared.js";
import { revokeRefreshTokenFamiliesForUser } from "./refreshTokenFamilies.js";
import { getPasswordPolicyViolation } from "../../security/passwordPolicy.js";

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
    const user = await AdminUser.findById(userId);
    if (!user) {
        throw createAuthError("USER_NOT_FOUND", "Utilisateur introuvable.");
    }

    user.passwordHash = await deps.hashPassword(nextPassword);
    user.refreshTokenHash = null;
    user.refreshTokenExpiresAt = null;
    user.massDownloadRestrictedUntil = null;
    user.passwordResetRequired = false;
    user.mustChangePasswordOnNextLogin = shouldGenerateTemporaryPassword;
    deps.revokeAccessTokens(user);
    await revokeRefreshTokenFamiliesForUser(user._id, "PASSWORD_RESET");
    await user.save();

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
    const user = await AdminUser.findById(authUser.userId);
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

    user.passwordHash = await deps.hashPassword(newPassword);
    user.mustChangePasswordOnNextLogin = false;
    user.passwordResetRequired = false;
    user.massDownloadRestrictedUntil = null;
    deps.revokeAccessTokens(user);
    await revokeRefreshTokenFamiliesForUser(user._id, "FORCED_PASSWORD_CHANGE");
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
        reason: "FORCED_PASSWORD_CHANGE_COMPLETED",
    });

    return { success: true };
}
