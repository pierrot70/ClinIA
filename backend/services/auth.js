import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";

import {
    ACCESS_TOKEN_EXPIRES_IN,
    AUTH_ROLE_VALUES,
    LOCKOUT_DURATION_MS,
    MAX_LOGIN_ATTEMPTS,
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

function createAuthError(code, message) {
    return { code, message };
}

const AUTH_LOG_COUNT_CACHE_TTL_MS = 30_000;
const authLogCountCache = new Map();

function buildAuthLogCountCacheKey({ startDate, endDate, action }) {
    return JSON.stringify({
        startDate: startDate || null,
        endDate: endDate || null,
        action: action || null,
    });
}

function getCachedAuthLogCount(cacheKey) {
    const cached = authLogCountCache.get(cacheKey);
    if (!cached) {
        return null;
    }

    if (Date.now() - cached.cachedAt > AUTH_LOG_COUNT_CACHE_TTL_MS) {
        authLogCountCache.delete(cacheKey);
        return null;
    }

    return cached.total;
}

function setCachedAuthLogCount(cacheKey, total) {
    authLogCountCache.set(cacheKey, {
        total,
        cachedAt: Date.now(),
    });
}

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

function signAccessToken(user) {
    return jwt.sign(
        {
            role: user.role,
            username: user.username,
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

function makeRefreshToken() {
    return crypto.randomBytes(48).toString("hex");
}

function makeTemporaryPassword() {
    return crypto.randomBytes(12).toString("base64url");
}

function getRequestIp(req) {
    const forwardedFor = req.headers["x-forwarded-for"];
    if (typeof forwardedFor === "string" && forwardedFor.trim()) {
        return forwardedFor.split(",")[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || "unknown";
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

function assertSuperAdmin(authUser) {
    if (!authUser?.role || authUser.role !== "SUPERADMIN") {
        throw createAuthError(
            "FORBIDDEN",
            "Action reservee au SUPERADMIN."
        );
    }
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
        typeof password !== "string" ||
        password.length < 8 ||
        password.length > 128 ||
        !AUTH_ROLE_VALUES.includes(role)
    ) {
        throw createAuthError(
            "INVALID_INPUT",
            "Donnees d'inscription invalides."
        );
    }

    return normalizedUsername;
}

async function setRotatedRefreshToken(user) {
    const refreshToken = makeRefreshToken();
    user.refreshTokenHash = hashToken(refreshToken);
    user.refreshTokenExpiresAt = new Date(
        Date.now() + REFRESH_TOKEN_TTL_MS
    );
    await user.save();

    return refreshToken;
}

export async function validateSessionState(user, now = Date.now()) {
    if (isSessionAbsoluteExpired(user, now)) {
        clearActiveSession(user, new Date(now));
        await user.save();
        throw createAuthError(
            "SESSION_ABSOLUTE_TIMEOUT",
            "La session a atteint sa duree maximale. Reconnectez-vous."
        );
    }

    if (isSessionIdleExpired(user, now)) {
        clearActiveSession(user, new Date(now));
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

    if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
        await recordAuthAuditEvent({
            action: "FAILED_LOGIN",
            outcome: "FAILED",
            userId: user._id,
            username: user.username,
            role: user.role,
            ip,
            reason: "ACCOUNT_LOCKED",
        });
        throw createAuthError(
            "ACCOUNT_LOCKED",
            "Compte temporairement verrouille suite a trop d'echecs."
        );
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);

    if (!passwordOk) {
        user.failedLoginAttempts += 1;

        if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
            user.lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
            user.failedLoginAttempts = 0;
        }

        await user.save();

        await recordAuthAuditEvent({
            action: "FAILED_LOGIN",
            outcome: "FAILED",
            userId: user._id,
            username: user.username,
            role: user.role,
            ip,
            reason: "INVALID_CREDENTIALS",
        });

        throw createAuthError(
            "INVALID_CREDENTIALS",
            "Nom d'utilisateur ou mot de passe invalide."
        );
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAt = new Date();
    user.sessionStartedAt = user.lastLoginAt;
    user.lastActivityAt = user.lastLoginAt;
    user.authTokenInvalidBefore = null;

    const refreshToken = await setRotatedRefreshToken(user);
    const accessToken = signAccessToken(user);

    await recordAuthAuditEvent({
        action: "LOGIN",
        outcome: "SUCCESS",
        userId: user._id,
        username: user.username,
        role: user.role,
        ip,
    });

    return {
        accessToken,
        refreshToken,
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

export async function refresh({ refreshToken, req }) {
    await enforceScheduledShutdownIfDue();

    assertRefreshInput(refreshToken);

    const tokenHash = hashToken(refreshToken);
    const user = await AdminUser.findOne({
        refreshTokenHash: tokenHash,
    });

    if (!user) {
        throw createAuthError(
            "INVALID_REFRESH_TOKEN",
            "Refresh token invalide."
        );
    }

    if (
        !user.refreshTokenExpiresAt ||
        user.refreshTokenExpiresAt.getTime() <= Date.now()
    ) {
        clearActiveSession(user);
        await user.save();

        throw createAuthError(
            "REFRESH_TOKEN_EXPIRED",
            "Refresh token expire."
        );
    }

    if (isShutdownEnforcedForRole(user.role)) {
        clearActiveSession(user);
        await user.save();
        throw createAuthError(
            "APP_SHUTDOWN",
            "Application arretee par le SUPERADMIN."
        );
    }

    await validateSessionState(user);
    user.lastActivityAt = new Date();

    const newRefreshToken = await setRotatedRefreshToken(user);
    const accessToken = signAccessToken(user);

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

    if (typeof refreshToken === "string" && refreshToken.trim()) {
        const tokenHash = hashToken(refreshToken);
        user = await AdminUser.findOne({ refreshTokenHash: tokenHash });
    }

    if (!user && authUser?.userId) {
        user = await AdminUser.findById(authUser.userId);
    }

    if (!user) {
        return { success: true };
    }

    clearActiveSession(user, new Date());
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
    const created = await AdminUser.create({
        username: uniqueUsername,
        email: normalizedEmail,
        passwordHash,
        role,
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
        },
    };
}

export async function registerSelf({ email, password, role, req }) {
    const ip = getRequestIp(req);
    const normalizedEmail = normalizeOptionalEmail(email);
    if (!normalizedEmail) {
        throw createAuthError("INVALID_INPUT", "Identifiant invalide.");
    }

    const targetRole = AUTH_ROLE_VALUES.includes(role) ? role : "USER";

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
            .select("username email role isActive createdAt lastLoginAt lastLogoutAt")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parsedLimit)
            .lean();

    return {
        users: users.map(mapPublicUser),
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
        .select("username email role isActive createdAt lastLoginAt lastLogoutAt")
        .sort({ lastLoginAt: -1, createdAt: -1 })
        .lean();

    return {
        users: users.map(mapPublicUser),
    };
}

export async function listAuthLogs({
    authUser,
    page = 1,
    limit = 20,
    startDate,
    endDate,
    action,
}) {
    assertSuperAdmin(authUser);

    const parsedPage = Number(page);
    const parsedLimit = Number(limit);

    if (
        !Number.isFinite(parsedPage) ||
        parsedPage < 1 ||
        !Number.isFinite(parsedLimit) ||
        parsedLimit < 1 ||
        parsedLimit > 100
    ) {
        throw createAuthError("INVALID_INPUT", "Pagination invalide.");
    }

    const allowedActions = new Set([
        "LOGIN",
        "LOGOUT",
        "FAILED_LOGIN",
        "USER_MANAGEMENT",
    ]);

    const query = {};
    const andClauses = [];

    if (startDate || endDate) {
        const dateQuery = {};

        if (startDate) {
            const parsedStart = new Date(`${startDate}T00:00:00.000`);
            if (Number.isNaN(parsedStart.getTime())) {
                throw createAuthError("INVALID_INPUT", "Date de debut invalide.");
            }
            dateQuery.$gte = parsedStart;
        }

        if (endDate) {
            const parsedEnd = new Date(`${endDate}T23:59:59.999`);
            if (Number.isNaN(parsedEnd.getTime())) {
                throw createAuthError("INVALID_INPUT", "Date de fin invalide.");
            }
            dateQuery.$lte = parsedEnd;
        }

        andClauses.push({ timestamp: dateQuery });
    }

    if (typeof action === "string" && action.trim()) {
        const normalizedAction = action.trim().toUpperCase();
        if (!allowedActions.has(normalizedAction)) {
            throw createAuthError("INVALID_INPUT", "Action invalide.");
        }
        andClauses.push({ action: normalizedAction });
    }

    if (andClauses.length > 0) {
        query.$and = andClauses;
    }

    const skip = (parsedPage - 1) * parsedLimit;
    const cacheKey = buildAuthLogCountCacheKey({
        startDate,
        endDate,
        action,
    });
    const cachedTotal = getCachedAuthLogCount(cacheKey);
    const totalPromise =
        cachedTotal !== null
            ? Promise.resolve(cachedTotal)
            : AuthAuditLog.countDocuments(query).then((total) => {
                setCachedAuthLogCount(cacheKey, total);
                return total;
            });

    const [total, logs] = await Promise.all([
        totalPromise,
        AuthAuditLog.find(query)
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(parsedLimit)
            .lean(),
    ]);

    return {
        logs: logs.map((log) => ({
            id: String(log._id),
            action: log.action,
            outcome: log.outcome,
            userId: log.userId ? String(log.userId) : null,
            usernameMasked: log.usernameMasked,
            role: log.role,
            ip: log.ip,
            reason: log.reason,
            timestamp: log.timestamp,
        })),
        pagination: {
            page: parsedPage,
            limit: parsedLimit,
            total,
            totalPages: Math.max(1, Math.ceil(total / parsedLimit)),
        },
    };
}

export async function listAuthLogGraphs({
    authUser,
    startDate,
    endDate,
    action,
}) {
    assertSuperAdmin(authUser);

    const allowedActions = new Set([
        "LOGIN",
        "LOGOUT",
        "FAILED_LOGIN",
        "USER_MANAGEMENT",
    ]);

    const query = {};
    const andClauses = [];

    if (startDate || endDate) {
        const dateQuery = {};

        if (startDate) {
            const parsedStart = new Date(`${startDate}T00:00:00.000`);
            if (Number.isNaN(parsedStart.getTime())) {
                throw createAuthError("INVALID_INPUT", "Date de debut invalide.");
            }
            dateQuery.$gte = parsedStart;
        }

        if (endDate) {
            const parsedEnd = new Date(`${endDate}T23:59:59.999`);
            if (Number.isNaN(parsedEnd.getTime())) {
                throw createAuthError("INVALID_INPUT", "Date de fin invalide.");
            }
            dateQuery.$lte = parsedEnd;
        }

        andClauses.push({ timestamp: dateQuery });
    }

    if (typeof action === "string" && action.trim()) {
        const normalizedAction = action.trim().toUpperCase();
        if (!allowedActions.has(normalizedAction)) {
            throw createAuthError("INVALID_INPUT", "Action invalide.");
        }
        andClauses.push({ action: normalizedAction });
    }

    if (andClauses.length > 0) {
        query.$and = andClauses;
    }

    const rows = await AuthAuditLog.aggregate([
        { $match: query },
        {
            $group: {
                _id: {
                    date: {
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: "$timestamp",
                        },
                    },
                    action: "$action",
                },
                count: { $sum: 1 },
            },
        },
        { $sort: { "_id.date": 1, "_id.action": 1 } },
    ]);

    const preferredActionOrder = [
        "LOGIN",
        "LOGOUT",
        "FAILED_LOGIN",
        "USER_MANAGEMENT",
    ];

    const actionSet = new Set();
    const byDate = new Map();

    for (const row of rows) {
        const date = row?._id?.date;
        const actionName = row?._id?.action;
        const count = Number(row?.count || 0);

        if (!date || !actionName) {
            continue;
        }

        actionSet.add(actionName);

        if (!byDate.has(date)) {
            byDate.set(date, {
                date,
                total: 0,
            });
        }

        const current = byDate.get(date);
        current[actionName] = count;
        current.total += count;
    }

    const actions = preferredActionOrder.filter((name) => actionSet.has(name));
    const points = Array.from(byDate.values()).sort((a, b) =>
        String(a.date).localeCompare(String(b.date))
    );

    return {
        actions,
        points,
    };
}

export async function updateUser({ userId, updates, authUser, req }) {
    assertSuperAdmin(authUser);
    assertValidUserId(userId);

    const ip = getRequestIp(req);
    const user = await AdminUser.findById(userId);
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

    Object.assign(user, next);
    await user.save();

    await recordAuthAuditEvent({
        action: "USER_MANAGEMENT",
        outcome: "SUCCESS",
        userId: authUser.userId,
        username: authUser.username,
        role: authUser.role,
        ip,
        reason: `UPDATE_USER:${String(user._id)}`,
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
    assertSuperAdmin(authUser);
    assertValidUserId(userId);

    const shouldGenerateTemporaryPassword =
        typeof newPassword === "undefined" ||
        newPassword === null ||
        newPassword === "";
    const nextPassword = shouldGenerateTemporaryPassword
        ? makeTemporaryPassword()
        : newPassword;

    if (
        typeof nextPassword !== "string" ||
        nextPassword.length < 8 ||
        nextPassword.length > 128
    ) {
        throw createAuthError("INVALID_INPUT", "Mot de passe invalide.");
    }

    const ip = getRequestIp(req);
    const user = await AdminUser.findById(userId);
    if (!user) {
        throw createAuthError("USER_NOT_FOUND", "Utilisateur introuvable.");
    }

    user.passwordHash = await hashPassword(nextPassword);
    user.refreshTokenHash = null;
    user.refreshTokenExpiresAt = null;
    user.massDownloadRestrictedUntil = null;
    user.passwordResetRequired = false;
    user.mustChangePasswordOnNextLogin = shouldGenerateTemporaryPassword;
    revokeAccessTokens(user);
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
        user: mapPublicUser(user),
        temporaryPassword: shouldGenerateTemporaryPassword ? nextPassword : null,
    };
}

export async function completeForcedPasswordChange({ authUser, newPassword, req }) {
    if (!authUser?.userId) {
        throw createAuthError("UNAUTHORIZED", "Authentification requise.");
    }

    if (
        typeof newPassword !== "string" ||
        newPassword.length < 8 ||
        newPassword.length > 128
    ) {
        throw createAuthError("INVALID_INPUT", "Mot de passe invalide.");
    }

    const ip = getRequestIp(req);
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

    user.passwordHash = await hashPassword(newPassword);
    user.mustChangePasswordOnNextLogin = false;
    user.passwordResetRequired = false;
    user.massDownloadRestrictedUntil = null;
    revokeAccessTokens(user);
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
    if (typeof password !== "string" || password.length < 8) {
        throw createAuthError(
            "INVALID_INPUT",
            "Le mot de passe doit contenir au moins 8 caracteres."
        );
    }

    return bcrypt.hash(password, 12);
}
