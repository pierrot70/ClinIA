import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";

import {
    ACCESS_TOKEN_EXPIRES_IN,
    AUTH_ROLES,
    AUTH_ROLE_VALUES,
    MAX_CONCURRENT_AUTH_SESSIONS,
    MFA_LOCKOUT_DURATION_MS,
    REFRESH_TOKEN_TTL_MS,
    SESSION_ABSOLUTE_TIMEOUT_MS,
    SESSION_IDLE_TIMEOUT_MS,
    SESSION_ACTIVITY_SAVE_WINDOW_MS,
    SENSITIVE_REAUTH_TTL_MS,
} from "../auth/constants.js";
import { recordAuthAuditEvent } from "../audit/authAudit.js";
import { AdminUser } from "../models/AdminUser.js";
import { AuthAuditLog } from "../models/AuthAuditLog.js";
import {
    enforceScheduledShutdownIfDue,
    isShutdownEnforcedForRole,
} from "./appShutdown.js";
import {
    listAuthLogGraphs,
    listAuthLogs,
} from "./auth/authAuditQueryService.js";
import {
    completeForcedPasswordChange as completeForcedPasswordChangeService,
    resetUserPassword as resetUserPasswordService,
} from "./auth/passwordAdminService.js";
import { assertSuperAdmin, createAuthError } from "./auth/shared.js";
import { getTrustedRequestIp } from "../utils/requestIp.js";
import { getPasswordPolicyViolation } from "../security/passwordPolicy.js";
import { createSecurityIncident } from "./securityIncidents.js";
import { logSafeError } from "../utils/requestLogSafety.js";
import {
    clearLoginFailureThrottle,
    getLoginFailureThrottle,
    recordLoginFailure,
} from "./auth/loginFailureThrottle.js";
import {
    createRefreshTokenFamilyId,
    createRefreshTokenSession,
    findRefreshTokenSession,
    hasActiveRefreshTokenSessionsForUser,
    listActiveRefreshTokenSessionsForUser,
    REFRESH_TOKEN_SESSION_STATUS,
    revokeRefreshTokenFamiliesForUser,
    revokeRefreshTokenFamily,
    revokeRefreshTokenSessionForUser,
    rotateActiveRefreshTokenSession,
} from "./auth/refreshTokenFamilies.js";
import {
    buildProvisioningUri,
    createMfaSecret,
    createRecoveryCodes,
    decryptMfaSecret,
    encryptMfaSecret,
    hashRecoveryCode,
    MFA_CHALLENGE_TTL_SECONDS,
    verifyTotp,
} from "./auth/mfa.js";

export { listAuthLogGraphs, listAuthLogs };

const MFA_CHALLENGE_MAX_ATTEMPTS = 5;

function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function revokeAccessTokens(user, at = new Date()) {
    user.authTokenInvalidBefore = at;
}

function clearActiveSession(user, at = new Date()) {
    user.refreshTokenHash = null;
    user.refreshTokenExpiresAt = null;
    user.sessionStartedAt = null;
    user.lastActivityAt = null;
    user.lastLogoutAt = at;
    user.activeSessionId = null;
    user.activeSessionIds = [];
    revokeAccessTokens(user, at);
}

function getJwtAccessSecret() {
    const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
    if (!secret) {
        throw createAuthError(
            "AUTH_MISCONFIGURED",
            "Configuration JWT manquante."
        );
    }

    return secret;
}

function signAccessToken(user, sessionId = user.activeSessionId) {
    return jwt.sign(
        {
            role: user.role,
            username: user.username,
            sid: sessionId || null,
        },
        getJwtAccessSecret(),
        {
            subject: String(user._id),
            algorithm: "HS256",
            expiresIn: ACCESS_TOKEN_EXPIRES_IN,
            issuer: "clinia-backend",
            audience: "clinia-app",
        }
    );
}

function isPrivilegedRole(role) {
    return role === AUTH_ROLES.ADMIN || role === AUTH_ROLES.SUPERADMIN;
}

function isPrivilegedMfaEnforced() {
    return (
        process.env.CLINIA_REQUIRE_MFA_FOR_PRIVILEGED === "true" ||
        process.env.NODE_ENV === "production"
    );
}

function requiresMfa(user) {
    return (
        (isPrivilegedMfaEnforced() && isPrivilegedRole(user?.role)) ||
        user?.mfaRequired === true ||
        user?.mfaEnabled === true
    );
}

function clearMfaChallenge(user) {
    user.mfaChallengeId = null;
    user.mfaChallengePurpose = null;
    user.mfaChallengeExpiresAt = null;
    user.mfaChallengeAttempts = 0;
}

function createMfaChallenge(user, purpose) {
    const challengeId = crypto.randomUUID();
    user.mfaChallengeId = challengeId;
    user.mfaChallengePurpose = purpose;
    user.mfaChallengeExpiresAt = new Date(
        Date.now() + MFA_CHALLENGE_TTL_SECONDS * 1000
    );
    user.mfaChallengeAttempts = 0;
    return signMfaChallenge(user, purpose, challengeId);
}

function signMfaChallenge(user, purpose, challengeId) {
    return jwt.sign({ purpose, role: user.role }, getJwtAccessSecret(), {
        subject: String(user._id), algorithm: "HS256", expiresIn: MFA_CHALLENGE_TTL_SECONDS,
        issuer: "clinia-backend", audience: "clinia-mfa", jwtid: challengeId,
    });
}

function verifyMfaChallenge(challenge) {
    try {
        return jwt.verify(challenge, getJwtAccessSecret(), {
            algorithms: ["HS256"], issuer: "clinia-backend", audience: "clinia-mfa",
        });
    } catch {
        throw createAuthError("INVALID_MFA_CHALLENGE", "Verification MFA invalide ou expiree.");
    }
}

function buildActiveMfaChallengeFilter(userId, challenge, now = new Date()) {
    return {
        _id: userId,
        mfaChallengeId: challenge.jti,
        mfaChallengePurpose: challenge.purpose,
        mfaChallengeExpiresAt: { $gt: now },
    };
}

function hasActiveMfaChallenge(user, challenge, now = new Date()) {
    return (
        typeof challenge?.jti === "string" &&
        user?.mfaChallengeId === challenge.jti &&
        user?.mfaChallengePurpose === challenge.purpose &&
        user?.mfaChallengeExpiresAt instanceof Date &&
        user.mfaChallengeExpiresAt > now &&
        Number(user.mfaChallengeAttempts || 0) < MFA_CHALLENGE_MAX_ATTEMPTS
    );
}

async function consumeMfaChallenge(user, challenge) {
    return AdminUser.findOneAndUpdate(
        {
            ...buildActiveMfaChallengeFilter(user._id, challenge),
            mfaChallengeAttempts: { $lt: MFA_CHALLENGE_MAX_ATTEMPTS },
        },
        {
            $set: {
                mfaChallengeId: null,
                mfaChallengePurpose: null,
                mfaChallengeExpiresAt: null,
                mfaChallengeAttempts: 0,
            },
        },
        { new: true }
    );
}

async function recordFailedMfaChallengeAttempt(user, challenge) {
    const activeFilter = buildActiveMfaChallengeFilter(user._id, challenge);
    const incremented = await AdminUser.findOneAndUpdate(
        {
            ...activeFilter,
            mfaChallengeAttempts: { $lt: MFA_CHALLENGE_MAX_ATTEMPTS - 1 },
        },
        { $inc: { mfaChallengeAttempts: 1 } },
        { new: true }
    );

    if (incremented) return { exhausted: false };

    const mfaLockedUntil = new Date(Date.now() + MFA_LOCKOUT_DURATION_MS);
    const exhausted = await AdminUser.findOneAndUpdate(
        {
            ...activeFilter,
            mfaChallengeAttempts: MFA_CHALLENGE_MAX_ATTEMPTS - 1,
        },
        {
            $set: {
                mfaChallengeId: null,
                mfaChallengePurpose: null,
                mfaChallengeExpiresAt: null,
                mfaChallengeAttempts: MFA_CHALLENGE_MAX_ATTEMPTS,
                mfaLockedUntil,
            },
        },
        { new: true }
    );

    return {
        exhausted: Boolean(exhausted),
        mfaLockedUntil: exhausted ? mfaLockedUntil : null,
    };
}

function createMfaTemporarilyLockedError(mfaLockedUntil) {
    const error = createAuthError(
        "MFA_TEMPORARILY_LOCKED",
        "Verification MFA temporairement bloquee suite a trop d'echecs."
    );
    error.mfaLockedUntil = mfaLockedUntil.toISOString();
    return error;
}

async function createMfaChallengeExhaustedIncident(user) {
    try {
        await createSecurityIncident({
            type: "MFA_CHALLENGE_EXHAUSTED",
            phase: "auth",
            reason: "Le nombre maximal d'essais MFA pour un defi a ete atteint.",
            requestPath: "/api/auth/login/mfa",
            transport: "internal_auth",
            matches: [],
            context: {
                userId: String(user._id),
                role: user.role,
            },
        });
    } catch (error) {
        logSafeError("MFA_CHALLENGE_EXHAUSTED_INCIDENT_WRITE_FAILED", error);
    }
}

function makeRefreshToken() {
    return crypto.randomBytes(48).toString("hex");
}

function makeTemporaryPassword() {
    return crypto.randomBytes(12).toString("base64url");
}

function getRequestIp(req) {
    return getTrustedRequestIp(req);
}

function isSessionIdleExpired(user, now = Date.now()) {
    if (!user?.lastActivityAt) {
        return false;
    }

    return new Date(user.lastActivityAt).getTime() + SESSION_IDLE_TIMEOUT_MS <= now;
}

function isSessionAbsoluteExpired(user, now = Date.now()) {
    if (!user?.sessionStartedAt) {
        return false;
    }

    return new Date(user.sessionStartedAt).getTime() + SESSION_ABSOLUTE_TIMEOUT_MS <= now;
}

function assertValidUserId(userId) {
    if (
        typeof userId !== "string" ||
        !/^[a-fA-F0-9]{24}$/.test(userId)
    ) {
        throw createAuthError("INVALID_INPUT", "Identifiant utilisateur invalide.");
    }
}

function mapPublicUser(user) {
    return {
        id: String(user._id),
        username: user.username,
        email: user.email || null,
        role: user.role,
        isActive: user.isActive !== false,
        passwordResetRequired: user.passwordResetRequired === true,
        mustChangePasswordOnNextLogin:
            user.mustChangePasswordOnNextLogin === true,
        mfaRequired: user.mfaRequired === true,
        mfaEnabled: user.mfaEnabled === true,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt || null,
        lastLogoutAt: user.lastLogoutAt || null,
        authTokenInvalidBefore: user.authTokenInvalidBefore || null,
    };
}

function normalizeUsername(username) {
    return String(username || "").trim().toLowerCase();
}

function resolveLoginIdentifier({ username, email }) {
    const hasUsername = typeof username !== "undefined";
    const hasEmail = typeof email !== "undefined";

    if (!hasUsername && !hasEmail) {
        throw createAuthError(
            "INVALID_INPUT",
            "Identifiants invalides."
        );
    }

    if (hasUsername && typeof username !== "string") {
        throw createAuthError(
            "INVALID_INPUT",
            "Identifiants invalides."
        );
    }

    if (hasEmail && typeof email !== "string") {
        throw createAuthError(
            "INVALID_INPUT",
            "Identifiants invalides."
        );
    }

    const usernameValue = hasUsername
        ? normalizeUsername(username)
        : "";
    const emailValue = hasEmail ? normalizeUsername(email) : "";

    if (hasUsername && hasEmail && usernameValue !== emailValue) {
        throw createAuthError(
            "INVALID_INPUT",
            "Identifiants invalides."
        );
    }

    return usernameValue || emailValue;
}

function assertCredentialsInput({ identifier, password }) {
    const identifierRegex = /^[a-z0-9._%+\-@]+$/;

    if (
        typeof identifier !== "string" ||
        identifier.length < 3 ||
        identifier.length > 254 ||
        !identifierRegex.test(identifier) ||
        typeof password !== "string" ||
        password.length < 8 ||
        password.length > 128
    ) {
        throw createAuthError(
            "INVALID_INPUT",
            "Identifiants invalides."
        );
    }
}

function assertRefreshInput(refreshToken) {
    if (
        typeof refreshToken !== "string" ||
        refreshToken.trim().length < 32
    ) {
        throw createAuthError(
            "INVALID_INPUT",
            "Refresh token invalide."
        );
    }
}

function makeUsernameFromEmail(email) {
    const localPart = String(email || "")
        .split("@")[0]
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "");

    const compact = localPart.replace(/\.+/g, ".").replace(/^\.|\.$/g, "");

    if (compact.length >= 3) {
        return compact.slice(0, 64);
    }

    const suffix = crypto.randomBytes(3).toString("hex");
    return `user_${suffix}`;
}

async function makeUniqueUsername(baseUsername) {
    const base = String(baseUsername).slice(0, 54);
    for (let i = 0; i < 50; i += 1) {
        const candidate = i === 0 ? base : `${base}${i}`;
        const existing = await AdminUser.findOne({ username: candidate });
        if (!existing) {
            return candidate;
        }
    }

    const suffix = crypto.randomBytes(4).toString("hex");
    return `${base.slice(0, 50)}_${suffix}`;
}

function normalizeOptionalEmail(email) {
    if (typeof email === "undefined" || email === null || email === "") {
        return null;
    }

    if (typeof email !== "string") {
        throw createAuthError("INVALID_INPUT", "Identifiant invalide.");
    }

    const normalized = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (
        normalized.length < 6 ||
        normalized.length > 254 ||
        !emailRegex.test(normalized)
    ) {
        throw createAuthError("INVALID_INPUT", "Identifiant invalide.");
    }

    return normalized;
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertRegisterInput({ username, password, role }) {
    const identifierRegex = /^[a-z0-9._%+\-@]+$/;
    const normalizedUsername = normalizeUsername(username);

    if (
        normalizedUsername.length < 3 ||
        normalizedUsername.length > 64 ||
        !identifierRegex.test(normalizedUsername) ||
        getPasswordPolicyViolation(password) ||
        !AUTH_ROLE_VALUES.includes(role)
    ) {
        throw createAuthError(
            "INVALID_INPUT",
            "Donnees d'inscription invalides."
        );
    }

    return normalizedUsername;
}

async function setRotatedRefreshToken(
    user,
    familyId = createRefreshTokenFamilyId(),
    sessionId = user.activeSessionId || null
) {
    const refreshToken = makeRefreshToken();
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await createRefreshTokenSession({
        userId: user._id,
        familyId,
        sessionId,
        tokenHash,
        expiresAt,
    });

    // Maintained temporarily for compatibility with active sessions created
    // before refresh-token family tracking was introduced.
    user.refreshTokenHash = tokenHash;
    user.refreshTokenExpiresAt = expiresAt;
    await user.save();

    return refreshToken;
}

function getKnownActiveSessionIds(user) {
    const known = Array.isArray(user?.activeSessionIds)
        ? user.activeSessionIds.filter((value) => typeof value === "string" && value)
        : [];

    if (
        typeof user?.activeSessionId === "string" &&
        user.activeSessionId &&
        !known.includes(user.activeSessionId)
    ) {
        known.unshift(user.activeSessionId);
    }

    return [...new Set(known)];
}

function isKnownActiveSession(user, sessionId) {
    return typeof sessionId === "string" &&
        getKnownActiveSessionIds(user).includes(sessionId);
}

async function completeAuthenticatedSession(user, ip, mfaAction = null) {
    const now = new Date();
    const activeSessions = await listActiveRefreshTokenSessionsForUser(user._id, now);
    const activeSessionIds = [
        ...getKnownActiveSessionIds(user),
        ...activeSessions
            .map((session) => session?.sessionId)
            .filter((value) => typeof value === "string" && value),
    ].filter((value, index, values) => values.indexOf(value) === index);
    const sessionId = crypto.randomUUID();
    let evictedSessionId = null;

    if (activeSessionIds.length >= MAX_CONCURRENT_AUTH_SESSIONS) {
        evictedSessionId = activeSessionIds.shift();
        await revokeRefreshTokenSessionForUser(
            user._id,
            evictedSessionId,
            "SESSION_LIMIT_REACHED",
            now
        );
        if (user.activeSessionId === evictedSessionId) {
            user.activeSessionId = null;
        }
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.mfaLockedUntil = null;
    user.lastLoginAt = now;
    user.sessionStartedAt = user.lastLoginAt;
    user.lastActivityAt = user.lastLoginAt;
    user.authTokenInvalidBefore = null;
    user.activeSessionIds = [...activeSessionIds, sessionId];
    const refreshToken = await setRotatedRefreshToken(user, undefined, sessionId);
    const accessToken = signAccessToken(user, sessionId);

    if (evictedSessionId) {
        await recordAuthAuditEvent({
            action: "SESSION_LIMIT_REACHED",
            outcome: "SUCCESS",
            userId: user._id,
            username: user.username,
            role: user.role,
            ip,
            reason: "OLDEST_SESSION_REVOKED",
        });

        try {
            await createSecurityIncident({
                type: "SESSION_LIMIT_REACHED",
                phase: "auth",
                reason: "Une nouvelle connexion MFA a ferme la session active la plus ancienne.",
                requestPath: "/api/auth/login/mfa",
                transport: "internal_auth",
                matches: [],
                context: { userId: String(user._id), role: user.role },
            });
        } catch (error) {
            logSafeError("SESSION_LIMIT_INCIDENT_WRITE_FAILED", error);
        }
    }

    await recordAuthAuditEvent({ action: mfaAction || "LOGIN", outcome: "SUCCESS", userId: user._id, username: user.username, role: user.role, ip });
    return {
        accessToken, refreshToken, expiresIn: ACCESS_TOKEN_EXPIRES_IN,
        user: { id: String(user._id), username: user.username, role: user.role,
            passwordResetRequired: user.passwordResetRequired === true,
            mustChangePasswordOnNextLogin: user.mustChangePasswordOnNextLogin === true },
    };
}

async function revokeRefreshSessionFamilyForReplay(user, familyId, req) {
    const now = new Date();
    await revokeRefreshTokenFamily(familyId, "REFRESH_TOKEN_REPLAY", now);
    clearActiveSession(user, now);
    await user.save();

    await recordAuthAuditEvent({
        action: "REFRESH_TOKEN_REPLAY",
        outcome: "FAILED",
        userId: user._id,
        username: user.username,
        role: user.role,
        ip: getRequestIp(req),
        reason: "ROTATED_TOKEN_REUSED",
    });

    try {
        await createSecurityIncident({
            type: "REFRESH_TOKEN_REPLAY",
            phase: "auth",
            reason: "Un refresh token deja remplace a ete reutilise.",
            requestPath: "/api/auth/refresh",
            transport: "internal_auth",
            matches: [],
            context: {
                userId: String(user._id),
                role: user.role,
            },
        });
    } catch (error) {
        logSafeError("REFRESH_TOKEN_REPLAY_INCIDENT_WRITE_FAILED", error);
    }

    throw createAuthError(
        "REFRESH_TOKEN_REUSED",
        "Session invalidee apres reutilisation d'un refresh token. Reconnectez-vous."
    );
}

export async function validateSessionState(user, now = Date.now()) {
    if (isSessionAbsoluteExpired(user, now)) {
        clearActiveSession(user, new Date(now));
        await revokeRefreshTokenFamiliesForUser(user._id, "SESSION_ABSOLUTE_TIMEOUT");
        await user.save();
        throw createAuthError(
            "SESSION_ABSOLUTE_TIMEOUT",
            "La session a atteint sa duree maximale. Reconnectez-vous."
        );
    }

    if (isSessionIdleExpired(user, now)) {
        clearActiveSession(user, new Date(now));
        await revokeRefreshTokenFamiliesForUser(user._id, "SESSION_IDLE_TIMEOUT");
        await user.save();
        throw createAuthError(
            "SESSION_IDLE_TIMEOUT",
            "La session a expire apres une periode d'inactivite."
        );
    }
}

export async function touchSessionActivity(user, now = Date.now()) {
    const lastActivityAt = user.lastActivityAt
        ? new Date(user.lastActivityAt).getTime()
        : 0;

    if (now - lastActivityAt < SESSION_ACTIVITY_SAVE_WINDOW_MS) {
        return;
    }

    user.lastActivityAt = new Date(now);
    if (typeof user.save !== "function") {
        return;
    }
    await user.save();
}

export async function reauthenticate({ authUser, password, req }) {
    const normalizedPassword = String(password || "");
    if (
        !authUser?.userId ||
        typeof password !== "string" ||
        normalizedPassword.length < 8 ||
        normalizedPassword.length > 128
    ) {
        throw createAuthError(
            "INVALID_INPUT",
            "Mot de passe de confirmation invalide."
        );
    }

    const ip = getRequestIp(req);
    const user = await AdminUser.findById(authUser.userId);

    if (!user || user.isActive === false) {
        throw createAuthError(
            "ACCOUNT_INACTIVE",
            "Compte inactif ou inaccessible."
        );
    }

    const passwordOk = await bcrypt.compare(normalizedPassword, user.passwordHash);
    if (!passwordOk) {
        await recordAuthAuditEvent({
            action: "FAILED_LOGIN",
            outcome: "FAILED",
            userId: user._id,
            username: user.username,
            role: user.role,
            ip,
            reason: "REAUTH_INVALID_CREDENTIALS",
        });

        throw createAuthError(
            "INVALID_CREDENTIALS",
            "Mot de passe de confirmation invalide."
        );
    }

    await validateSessionState(user);
    user.lastActivityAt = new Date();
    await user.save();

    return jwt.sign(
        {
            purpose: "sensitive-reauth",
            role: user.role,
        },
        getJwtAccessSecret(),
        {
            subject: String(user._id),
            algorithm: "HS256",
            expiresIn: Math.floor(SENSITIVE_REAUTH_TTL_MS / 1000),
            issuer: "clinia-backend",
            audience: "clinia-sensitive-reauth",
        }
    );
}

export async function login({ username, email, password, req }) {
    await enforceScheduledShutdownIfDue();

    const normalizedIdentifier = resolveLoginIdentifier({
        username,
        email,
    });
    assertCredentialsInput({
        identifier: normalizedIdentifier,
        password,
    });

    const ip = getRequestIp(req);

    const user = await AdminUser.findOne({
        $or: [
            { username: normalizedIdentifier },
            { email: normalizedIdentifier },
        ],
    });

    if (!user) {
        await recordAuthAuditEvent({
            action: "FAILED_LOGIN",
            outcome: "FAILED",
            username: normalizedIdentifier,
            ip,
            reason: "INVALID_CREDENTIALS",
        });
        throw createAuthError(
            "INVALID_CREDENTIALS",
            "Nom d'utilisateur ou mot de passe invalide."
        );
    }

    if (user.isActive === false) {
        await recordAuthAuditEvent({
            action: "FAILED_LOGIN",
            outcome: "FAILED",
            userId: user._id,
            username: user.username,
            role: user.role,
            ip,
            reason: "ACCOUNT_INACTIVE",
        });
        throw createAuthError(
            "ACCOUNT_INACTIVE",
            "Compte inactif."
        );
    }

    if (isShutdownEnforcedForRole(user.role)) {
        throw createAuthError(
            "APP_SHUTDOWN",
            "Application arretee par le SUPERADMIN."
        );
    }

    const throttle = await getLoginFailureThrottle({
        userId: user._id,
        ip,
    });

    if (throttle.blocked) {
        // Do not extend the cooldown or produce another audit event while this
        // same source keeps retrying. That avoids turning the protection into a
        // permanent lockout or an audit-volume attack.
        throw createAuthError(
            "INVALID_CREDENTIALS",
            "Nom d'utilisateur ou mot de passe invalide."
        );
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);

    if (!passwordOk) {
        const throttleResult = await recordLoginFailure({
            userId: user._id,
            ip,
        });

        await recordAuthAuditEvent({
            action: "FAILED_LOGIN",
            outcome: "FAILED",
            userId: user._id,
            username: user.username,
            role: user.role,
            ip,
            reason: "INVALID_CREDENTIALS",
        });

        if (throttleResult.shouldCreateIncident) {
            try {
                await createSecurityIncident({
                    type: "LOGIN_FAILURE_THROTTLED",
                    phase: "auth",
                    reason:
                        "Des echecs de connexion repetes provenant de la meme origine ont declenche un delai progressif.",
                    requestPath: "/api/auth/login",
                    transport: "internal_auth",
                    matches: [],
                    context: {
                        userId: String(user._id),
                        role: user.role,
                        penaltyLevel: throttleResult.penaltyLevel,
                    },
                });
            } catch (error) {
                logSafeError("LOGIN_FAILURE_THROTTLE_INCIDENT_WRITE_FAILED", error);
            }
        }

        throw createAuthError(
            "INVALID_CREDENTIALS",
            "Nom d'utilisateur ou mot de passe invalide."
        );
    }

    await clearLoginFailureThrottle({ userId: user._id, ip });

    const replacesExistingSession =
        await hasActiveRefreshTokenSessionsForUser(user._id);

    // A previously active session is not an MFA signal.  In particular, a
    // clinician without MFA must not be enrolled into MFA just because they
    // sign in again from another tab or device.  Accounts for which MFA is
    // enabled or required still continue through the MFA challenge below.
    if (!requiresMfa(user)) {
        return completeAuthenticatedSession(user, ip);
    }

    if (user.mfaLockedUntil && user.mfaLockedUntil.getTime() > Date.now()) {
        await recordAuthAuditEvent({
            action: "MFA_FAILED",
            outcome: "FAILED",
            userId: user._id,
            username: user.username,
            role: user.role,
            ip,
            reason: "MFA_TEMPORARILY_LOCKED",
        });
        throw createMfaTemporarilyLockedError(user.mfaLockedUntil);
    }

    if (user.mfaLockedUntil) {
        user.mfaLockedUntil = null;
        await user.save();
    }

    if (!user.mfaEnabled) {
        const secret = createMfaSecret();
        user.mfaPendingSecretEncrypted = encryptMfaSecret(secret);
        user.mfaPendingExpiresAt = new Date(Date.now() + MFA_CHALLENGE_TTL_SECONDS * 1000);
        const mfaChallenge = createMfaChallenge(
            user,
            replacesExistingSession ? "mfa-concurrent-enroll" : "mfa-enroll"
        );
        await user.save();
        return {
            mfaRequired: true, mfaEnrollmentRequired: true,
            mfaChallenge,
            manualEntryKey: secret,
            provisioningUri: buildProvisioningUri({ secret, username: user.username }),
        };
    }

    const mfaChallenge = createMfaChallenge(user, "mfa-login");
    await user.save();
    return { mfaRequired: true, mfaEnrollmentRequired: false, mfaChallenge };
}

export async function completeMfaLogin({ mfaChallenge, code, req }) {
    if (typeof mfaChallenge !== "string" || mfaChallenge.length < 32 || typeof code !== "string") {
        throw createAuthError("INVALID_INPUT", "Code MFA invalide.");
    }
    const challenge = verifyMfaChallenge(mfaChallenge);
    const user = await AdminUser.findById(challenge.sub).select(
        "+mfaSecretEncrypted +mfaPendingSecretEncrypted +mfaPendingExpiresAt +mfaRecoveryCodeHashes +mfaChallengeId +mfaChallengePurpose +mfaChallengeExpiresAt +mfaChallengeAttempts"
    );
    if (!user || user.isActive === false) throw createAuthError("INVALID_MFA_CHALLENGE", "Verification MFA invalide ou expiree.");
    const ip = getRequestIp(req);
    let recoveryCodes = null;
    if (!hasActiveMfaChallenge(user, challenge)) {
        throw createAuthError("INVALID_MFA_CHALLENGE", "Verification MFA invalide ou expiree.");
    }
    if (["mfa-enroll", "mfa-concurrent-enroll"].includes(challenge.purpose)) {
        if (!user.mfaPendingSecretEncrypted || !user.mfaPendingExpiresAt || user.mfaPendingExpiresAt <= new Date()) throw createAuthError("INVALID_MFA_CHALLENGE", "Verification MFA invalide ou expiree.");
        if (!verifyTotp(decryptMfaSecret(user.mfaPendingSecretEncrypted), code)) {
            const attempt = await recordFailedMfaChallengeAttempt(user, challenge);
            await recordAuthAuditEvent({ action: "MFA_FAILED", outcome: "FAILED", userId: user._id, username: user.username, role: user.role, ip, reason: attempt.exhausted ? "MFA_CHALLENGE_EXHAUSTED" : "INVALID_MFA_CODE" });
            if (attempt.exhausted) {
                await createMfaChallengeExhaustedIncident(user);
                throw createMfaTemporarilyLockedError(attempt.mfaLockedUntil);
            }
            throw createAuthError("INVALID_MFA_CODE", "Code MFA invalide.");
        }
        if (!await consumeMfaChallenge(user, challenge)) throw createAuthError("INVALID_MFA_CHALLENGE", "Verification MFA invalide ou expiree.");
        recoveryCodes = createRecoveryCodes();
        user.mfaSecretEncrypted = user.mfaPendingSecretEncrypted;
        user.mfaPendingSecretEncrypted = null;
        user.mfaPendingExpiresAt = null;
        user.mfaRecoveryCodeHashes = recoveryCodes.map(hashRecoveryCode);
        user.mfaEnabled = true;
        if (challenge.purpose === "mfa-concurrent-enroll") {
            user.mfaRequired = true;
        }
        clearMfaChallenge(user);
        await user.save();
        const session = await completeAuthenticatedSession(user, ip, "MFA_ENROLLED");
        return { ...session, recoveryCodes };
    }
    if (challenge.purpose !== "mfa-login" || !user.mfaEnabled || !user.mfaSecretEncrypted) throw createAuthError("INVALID_MFA_CHALLENGE", "Verification MFA invalide ou expiree.");
    const recoveryHash = hashRecoveryCode(code);
    const recoveryIndex = user.mfaRecoveryCodeHashes.indexOf(recoveryHash);
    const valid = recoveryIndex >= 0 || verifyTotp(decryptMfaSecret(user.mfaSecretEncrypted), code);
    if (!valid) {
        const attempt = await recordFailedMfaChallengeAttempt(user, challenge);
        await recordAuthAuditEvent({ action: "MFA_FAILED", outcome: "FAILED", userId: user._id, username: user.username, role: user.role, ip, reason: attempt.exhausted ? "MFA_CHALLENGE_EXHAUSTED" : "INVALID_MFA_CODE" });
        if (attempt.exhausted) {
            await createMfaChallengeExhaustedIncident(user);
            throw createMfaTemporarilyLockedError(attempt.mfaLockedUntil);
        }
        throw createAuthError("INVALID_MFA_CODE", "Code MFA invalide.");
    }
    if (!await consumeMfaChallenge(user, challenge)) throw createAuthError("INVALID_MFA_CHALLENGE", "Verification MFA invalide ou expiree.");
    if (recoveryIndex >= 0) user.mfaRecoveryCodeHashes.splice(recoveryIndex, 1);
    clearMfaChallenge(user);
    await user.save();
    return completeAuthenticatedSession(user, ip, recoveryIndex >= 0 ? "MFA_RECOVERY_CODE_USED" : "MFA_LOGIN");
}

export async function refresh({ refreshToken, req }) {
    await enforceScheduledShutdownIfDue();

    assertRefreshInput(refreshToken);

    const tokenHash = hashToken(refreshToken);
    let tokenSession = await findRefreshTokenSession(tokenHash);
    let user = null;

    if (tokenSession) {
        user = await AdminUser.findById(tokenSession.userId);
    } else {
        // One-time compatibility path for a still-valid session issued before
        // token family tracking. It immediately becomes a rotated member.
        user = await AdminUser.findOne({ refreshTokenHash: tokenHash });
        if (user) {
            const expiresAt = user.refreshTokenExpiresAt;
            if (expiresAt && expiresAt.getTime() > Date.now()) {
                const familyId = createRefreshTokenFamilyId();
                await createRefreshTokenSession({
                    userId: user._id,
                    familyId,
                    sessionId: user.activeSessionId || null,
                    tokenHash,
                    expiresAt,
                    status: REFRESH_TOKEN_SESSION_STATUS.ROTATED,
                    rotatedAt: new Date(),
                });
                tokenSession = {
                    userId: user._id,
                    familyId,
                    sessionId: user.activeSessionId || null,
                    status: REFRESH_TOKEN_SESSION_STATUS.ROTATED,
                    expiresAt,
                    legacyUpgrade: true,
                };
            }
        }
    }

    if (!user || !tokenSession) {
        throw createAuthError(
            "INVALID_REFRESH_TOKEN",
            "Refresh token invalide."
        );
    }

    const sessionId = tokenSession.sessionId || user.activeSessionId || null;
    if (!isKnownActiveSession(user, sessionId)) {
        throw createAuthError(
            "SESSION_REPLACED",
            "Cette session a ete remplacee par une connexion plus recente."
        );
    }

    if (
        tokenSession.status === REFRESH_TOKEN_SESSION_STATUS.ROTATED &&
        !tokenSession.legacyUpgrade
    ) {
        await revokeRefreshSessionFamilyForReplay(user, tokenSession.familyId, req);
    }

    if (tokenSession.status !== REFRESH_TOKEN_SESSION_STATUS.ACTIVE && !tokenSession.legacyUpgrade) {
        throw createAuthError(
            "INVALID_REFRESH_TOKEN",
            "Refresh token invalide."
        );
    }

    if (
        !tokenSession.expiresAt ||
        new Date(tokenSession.expiresAt).getTime() <= Date.now()
    ) {
        clearActiveSession(user);
        await revokeRefreshTokenFamily(tokenSession.familyId, "EXPIRED");
        await user.save();

        throw createAuthError(
            "REFRESH_TOKEN_EXPIRED",
            "Refresh token expire."
        );
    }

    if (isShutdownEnforcedForRole(user.role)) {
        clearActiveSession(user);
        await revokeRefreshTokenFamily(tokenSession.familyId, "APP_SHUTDOWN");
        await user.save();
        throw createAuthError(
            "APP_SHUTDOWN",
            "Application arretee par le SUPERADMIN."
        );
    }

    await validateSessionState(user);
    user.lastActivityAt = new Date();

    let familyId = tokenSession.familyId;
    if (!tokenSession.legacyUpgrade) {
        const rotated = await rotateActiveRefreshTokenSession(tokenHash);
        if (!rotated) {
            const currentTokenSession = await findRefreshTokenSession(tokenHash);
            if (
                currentTokenSession?.status === REFRESH_TOKEN_SESSION_STATUS.ROTATED
            ) {
                await revokeRefreshSessionFamilyForReplay(
                    user,
                    currentTokenSession.familyId,
                    req
                );
            }

            throw createAuthError(
                "INVALID_REFRESH_TOKEN",
                "Refresh token invalide."
            );
        }
        familyId = rotated.familyId;
    }

    const newRefreshToken = await setRotatedRefreshToken(
        user,
        familyId,
        sessionId
    );
    const accessToken = signAccessToken(user, sessionId);

    return {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: ACCESS_TOKEN_EXPIRES_IN,
        user: {
            id: String(user._id),
            username: user.username,
            role: user.role,
            passwordResetRequired: user.passwordResetRequired === true,
            mustChangePasswordOnNextLogin:
                user.mustChangePasswordOnNextLogin === true,
        },
    };
}

export async function logout({ refreshToken, authUser, req }) {
    const ip = getRequestIp(req);

    let user = null;

    let tokenSession = null;
    if (typeof refreshToken === "string" && refreshToken.trim()) {
        const tokenHash = hashToken(refreshToken);
        tokenSession = await findRefreshTokenSession(tokenHash);
        user = await AdminUser.findOne({ refreshTokenHash: tokenHash });
        if (!user && tokenSession?.userId) {
            user = await AdminUser.findById(tokenSession.userId);
        }
    }

    if (!user && authUser?.userId) {
        user = await AdminUser.findById(authUser.userId);
    }

    if (!user) {
        return { success: true };
    }

    const sessionId = authUser?.sessionId || tokenSession?.sessionId || user.activeSessionId;
    const now = new Date();

    if (!sessionId) {
        clearActiveSession(user, now);
        await revokeRefreshTokenFamiliesForUser(user._id, "LOGOUT", now);
    } else {
        user.activeSessionIds = getKnownActiveSessionIds(user)
            .filter((value) => value !== sessionId);
        if (user.activeSessionId === sessionId) {
            user.activeSessionId = null;
        }
        user.lastLogoutAt = now;
        await revokeRefreshTokenSessionForUser(user._id, sessionId, "LOGOUT", now);
    }
    await user.save();

    await recordAuthAuditEvent({
        action: "LOGOUT",
        outcome: "SUCCESS",
        userId: user._id,
        username: user.username,
        role: user.role,
        ip,
    });

    return { success: true };
}

export async function register({
    username,
    email,
    password,
    role,
    mfaRequired,
    authUser,
    req,
}) {
    const ip = getRequestIp(req);
    const normalizedEmail = normalizeOptionalEmail(email);
    const requestedUsername =
        typeof username === "string" && username.trim()
            ? normalizeUsername(username)
            : normalizedEmail
                ? makeUsernameFromEmail(normalizedEmail)
                : "";

    const normalizedUsername = assertRegisterInput({
        username: requestedUsername,
        password,
        role,
    });

    if (!authUser?.role) {
        throw createAuthError("FORBIDDEN", "Permissions insuffisantes.");
    }

    if (role === "SUPERADMIN" && authUser.role !== "SUPERADMIN") {
        throw createAuthError(
            "FORBIDDEN",
            "Seul un SUPERADMIN peut creer un SUPERADMIN."
        );
    }

    if (typeof mfaRequired !== "undefined" && typeof mfaRequired !== "boolean") {
        throw createAuthError("INVALID_INPUT", "Parametre MFA invalide.");
    }

    if (mfaRequired === true && authUser.role !== AUTH_ROLES.SUPERADMIN) {
        throw createAuthError(
            "FORBIDDEN",
            "Seul un SUPERADMIN peut definir la politique MFA d'un utilisateur."
        );
    }

    const existing = await AdminUser.findOne({
        $or: [
            { username: normalizedUsername },
            ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
        ],
    });

    if (existing) {
        await recordAuthAuditEvent({
            action: "REGISTER",
            outcome: "FAILED",
            userId: authUser.userId ?? null,
            username: authUser.username ?? normalizedUsername,
            role: authUser.role,
            ip,
            reason: "USER_ALREADY_EXISTS",
        });
        throw createAuthError(
            "USER_EXISTS",
            "Un utilisateur avec cet identifiant existe deja."
        );
    }

    const uniqueUsername = await makeUniqueUsername(normalizedUsername);
    const passwordHash = await hashPassword(password);
    const roleRequiresMfa =
        isPrivilegedMfaEnforced() && isPrivilegedRole(role);
    const created = await AdminUser.create({
        username: uniqueUsername,
        email: normalizedEmail,
        passwordHash,
        role,
        mfaRequired: roleRequiresMfa || mfaRequired === true,
    });

    await recordAuthAuditEvent({
        action: "REGISTER",
        outcome: "SUCCESS",
        userId: authUser.userId ?? null,
        username: authUser.username ?? normalizedUsername,
        role: authUser.role,
        ip,
        reason: `CREATED_${role}`,
    });

    return {
        user: {
            id: String(created._id),
            username: created.username,
            email: created.email,
            role: created.role,
            mfaRequired: created.mfaRequired === true,
        },
    };
}

export async function registerSelf({ email, password, req }) {
    const ip = getRequestIp(req);
    const normalizedEmail = normalizeOptionalEmail(email);
    if (!normalizedEmail) {
        throw createAuthError("INVALID_INPUT", "Identifiant invalide.");
    }

    const targetRole = AUTH_ROLES.USER;

    const requestedUsername = makeUsernameFromEmail(normalizedEmail);
    const normalizedUsername = assertRegisterInput({
        username: requestedUsername,
        password,
        role: targetRole,
    });

    const existing = await AdminUser.findOne({
        $or: [
            { username: normalizedUsername },
            { email: normalizedEmail },
        ],
    });

    if (existing) {
        await recordAuthAuditEvent({
            action: "REGISTER",
            outcome: "FAILED",
            username: normalizedEmail,
            role: targetRole,
            ip,
            reason: "USER_ALREADY_EXISTS",
        });
        throw createAuthError(
            "USER_EXISTS",
            "Un utilisateur avec cet email existe deja."
        );
    }

    const uniqueUsername = await makeUniqueUsername(normalizedUsername);
    const passwordHash = await hashPassword(password);
    const created = await AdminUser.create({
        username: uniqueUsername,
        email: normalizedEmail,
        passwordHash,
        role: targetRole,
    });

    await recordAuthAuditEvent({
        action: "REGISTER",
        outcome: "SUCCESS",
        userId: created._id,
        username: created.username,
        role: created.role,
        ip,
        reason: "SELF_REGISTER",
    });

    return {
        user: {
            id: String(created._id),
            username: created.username,
            email: created.email,
            role: created.role,
        },
    };
}

export async function listUsers({
    authUser,
    page = 1,
    limit = 10,
    search = "",
    role,
}) {
    assertSuperAdmin(authUser);

    const parsedPage = Number(page);
    const parsedLimit = Number(limit);
    const normalizedSearch = String(search || "").trim();
    const normalizedRole =
        typeof role === "string" && role.trim()
            ? role.trim().toUpperCase()
            : "";

    if (
        !Number.isFinite(parsedPage) ||
        parsedPage < 1 ||
        !Number.isFinite(parsedLimit) ||
        parsedLimit < 1 ||
        parsedLimit > 100
    ) {
        throw createAuthError("INVALID_INPUT", "Pagination invalide.");
    }

    if (normalizedSearch.length > 100) {
        throw createAuthError("INVALID_INPUT", "Filtre de recherche invalide.");
    }

    if (normalizedRole && !AUTH_ROLE_VALUES.includes(normalizedRole)) {
        throw createAuthError("INVALID_INPUT", "Role de filtre invalide.");
    }

    const query = {};

    if (normalizedSearch) {
        const safePattern = escapeRegex(normalizedSearch);
        query.$or = [
            { username: { $regex: safePattern, $options: "i" } },
            { email: { $regex: safePattern, $options: "i" } },
        ];
    }

    if (normalizedRole) {
        query.role = normalizedRole;
    }

    const total = await AdminUser.countDocuments(query);
    const totalPages = Math.max(1, Math.ceil(total / parsedLimit));
    const effectivePage = Math.min(parsedPage, totalPages);
    const skip = (effectivePage - 1) * parsedLimit;

    const users = await AdminUser.find(query)
            .select("username email role isActive mfaRequired mfaEnabled createdAt lastLoginAt lastLogoutAt")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parsedLimit)
            .lean();

    return {
        users: users.map(mapPublicUser),
        mfaPolicy: {
            privilegedRolesRequired: isPrivilegedMfaEnforced(),
        },
        pagination: {
            page: effectivePage,
            limit: parsedLimit,
            total,
            totalPages,
        },
        filters: {
            search: normalizedSearch,
            role: normalizedRole || null,
        },
    };
}

export async function listActiveUsers({ authUser }) {
    assertSuperAdmin(authUser);

    await enforceScheduledShutdownIfDue();

    const users = await AdminUser.find({
        isActive: true,
        refreshTokenHash: { $ne: null },
        refreshTokenExpiresAt: { $gt: new Date() },
    })
        .select("username email role isActive mfaRequired mfaEnabled createdAt lastLoginAt lastLogoutAt")
        .sort({ lastLoginAt: -1, createdAt: -1 })
        .lean();

    return {
        users: users.map(mapPublicUser),
    };
}


export async function updateUser({ userId, updates, authUser, req }) {
    assertSuperAdmin(authUser);
    assertValidUserId(userId);

    const ip = getRequestIp(req);
    const user = await AdminUser.findById(userId).select(
        "+mfaSecretEncrypted +mfaPendingSecretEncrypted +mfaPendingExpiresAt +mfaRecoveryCodeHashes +mfaChallengeId +mfaChallengePurpose +mfaChallengeExpiresAt +mfaChallengeAttempts"
    );
    if (!user) {
        throw createAuthError("USER_NOT_FOUND", "Utilisateur introuvable.");
    }

    const next = {};
    if (typeof updates?.username === "string") {
        const username = normalizeUsername(updates.username);
        if (!/^[a-z0-9._%+\-@]{3,64}$/.test(username)) {
            throw createAuthError("INVALID_INPUT", "Identifiant invalide.");
        }
        next.username = username;
    }

    if (typeof updates?.email !== "undefined") {
        next.email = normalizeOptionalEmail(updates.email);
    }

    if (typeof updates?.role === "string") {
        if (!AUTH_ROLE_VALUES.includes(updates.role)) {
            throw createAuthError("INVALID_INPUT", "Role invalide.");
        }
        next.role = updates.role;
    }

    if (typeof updates?.mfaRequired !== "undefined") {
        if (typeof updates.mfaRequired !== "boolean") {
            throw createAuthError("INVALID_INPUT", "Parametre MFA invalide.");
        }
        next.mfaRequired = updates.mfaRequired;
    }

    const effectiveRole = next.role || user.role;
    if (isPrivilegedMfaEnforced() && isPrivilegedRole(effectiveRole)) {
        next.mfaRequired = true;
    }

    if (Object.keys(next).length === 0) {
        throw createAuthError("INVALID_INPUT", "Aucune mise a jour valide fournie.");
    }

    if (
        String(user._id) === String(authUser.userId) &&
        next.role &&
        next.role !== "SUPERADMIN"
    ) {
        throw createAuthError(
            "FORBIDDEN",
            "Vous ne pouvez pas retrograder votre propre compte SUPERADMIN."
        );
    }

    if (next.username && next.username !== user.username) {
        const existingByUsername = await AdminUser.findOne({
            username: next.username,
            _id: { $ne: user._id },
        });
        if (existingByUsername) {
            throw createAuthError("USER_EXISTS", "Identifiant deja utilise.");
        }
    }

    if (typeof next.email !== "undefined" && next.email !== user.email) {
        if (next.email) {
            const existingByEmail = await AdminUser.findOne({
                email: next.email,
                _id: { $ne: user._id },
            });
            if (existingByEmail) {
                throw createAuthError("USER_EXISTS", "Identifiant deja utilise.");
            }
        }
    }

    const mfaPolicyChanged =
        typeof next.mfaRequired === "boolean" &&
        next.mfaRequired !== (user.mfaRequired === true);

    if (mfaPolicyChanged) {
        clearActiveSession(user);
        await revokeRefreshTokenFamiliesForUser(
            user._id,
            next.mfaRequired ? "MFA_REQUIRED_ENABLED" : "MFA_REQUIRED_DISABLED"
        );
    }

    if (next.mfaRequired === false) {
        user.mfaEnabled = false;
        user.mfaSecretEncrypted = null;
        user.mfaPendingSecretEncrypted = null;
        user.mfaPendingExpiresAt = null;
        user.mfaRecoveryCodeHashes = [];
        clearMfaChallenge(user);
    }

    Object.assign(user, next);
    await user.save();

    await recordAuthAuditEvent({
        action: "USER_MANAGEMENT",
        outcome: "SUCCESS",
        userId: authUser.userId,
        username: authUser.username,
        role: authUser.role,
        ip,
        reason: mfaPolicyChanged
            ? `UPDATE_USER_MFA_POLICY:${next.mfaRequired ? "REQUIRED" : "DISABLED"}`
            : `UPDATE_USER:${String(user._id)}`,
    });

    return {
        user: mapPublicUser(user),
    };
}

export async function setUserActiveStatus({ userId, isActive, authUser, req }) {
    assertSuperAdmin(authUser);
    assertValidUserId(userId);

    if (typeof isActive !== "boolean") {
        throw createAuthError("INVALID_INPUT", "Statut actif invalide.");
    }

    if (String(authUser.userId) === String(userId) && !isActive) {
        throw createAuthError(
            "FORBIDDEN",
            "Vous ne pouvez pas desactiver votre propre compte."
        );
    }

    const ip = getRequestIp(req);
    const user = await AdminUser.findById(userId);
    if (!user) {
        throw createAuthError("USER_NOT_FOUND", "Utilisateur introuvable.");
    }

    user.isActive = isActive;
    if (!isActive) {
        user.refreshTokenHash = null;
        user.refreshTokenExpiresAt = null;
        revokeAccessTokens(user);
    }
    await user.save();

    await recordAuthAuditEvent({
        action: "USER_MANAGEMENT",
        outcome: "SUCCESS",
        userId: authUser.userId,
        username: authUser.username,
        role: authUser.role,
        ip,
        reason: `${isActive ? "ACTIVATE" : "DEACTIVATE"}_USER:${String(user._id)}`,
    });

    return {
        user: mapPublicUser(user),
    };
}

export async function resetUserPassword({ userId, newPassword, authUser, req }) {
    return resetUserPasswordService({
        userId,
        newPassword,
        authUser,
        req,
        deps: {
            assertValidUserId,
            makeTemporaryPassword,
            getRequestIp,
            hashPassword,
            revokeAccessTokens,
            mapPublicUser,
        },
    });
}

export async function completeForcedPasswordChange({ authUser, newPassword, req }) {
    return completeForcedPasswordChangeService({
        authUser,
        newPassword,
        req,
        deps: {
            getRequestIp,
            hashPassword,
            revokeAccessTokens,
        },
    });
}

export async function deleteUser({ userId, authUser, req }) {
    assertSuperAdmin(authUser);
    assertValidUserId(userId);

    if (String(authUser.userId) === String(userId)) {
        throw createAuthError(
            "FORBIDDEN",
            "Vous ne pouvez pas supprimer votre propre compte."
        );
    }

    const ip = getRequestIp(req);
    const user = await AdminUser.findById(userId);
    if (!user) {
        throw createAuthError("USER_NOT_FOUND", "Utilisateur introuvable.");
    }

    await AdminUser.deleteOne({ _id: user._id });

    await recordAuthAuditEvent({
        action: "USER_MANAGEMENT",
        outcome: "SUCCESS",
        userId: authUser.userId,
        username: authUser.username,
        role: authUser.role,
        ip,
        reason: `DELETE_USER:${String(user._id)}`,
    });

    return {
        success: true,
    };
}

export async function hashPassword(password) {
    const violation = getPasswordPolicyViolation(password);
    if (violation) {
        throw createAuthError(
            "INVALID_INPUT",
            violation
        );
    }

    return bcrypt.hash(password, 12);
}
