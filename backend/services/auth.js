import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";

import {
    ACCESS_TOKEN_EXPIRES_IN,
    AUTH_ROLE_VALUES,
    LOCKOUT_DURATION_MS,
    MAX_LOGIN_ATTEMPTS,
    REFRESH_TOKEN_TTL_MS,
} from "../auth/constants.js";
import { recordAuthAuditEvent } from "../audit/authAudit.js";
import { AdminUser } from "../models/AdminUser.js";

function createAuthError(code, message) {
    return { code, message };
}

function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
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

function getRequestIp(req) {
    const forwardedFor = req.headers["x-forwarded-for"];
    if (typeof forwardedFor === "string" && forwardedFor.trim()) {
        return forwardedFor.split(",")[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || "unknown";
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
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt || null,
        lastLogoutAt: user.lastLogoutAt || null,
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
        throw createAuthError("INVALID_INPUT", "Email invalide.");
    }

    const normalized = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (
        normalized.length < 6 ||
        normalized.length > 254 ||
        !emailRegex.test(normalized)
    ) {
        throw createAuthError("INVALID_INPUT", "Email invalide.");
    }

    return normalized;
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

export async function login({ username, email, password, req }) {
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
        },
    };
}

export async function refresh({ refreshToken, req }) {
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
        user.refreshTokenHash = null;
        user.refreshTokenExpiresAt = null;
        await user.save();

        throw createAuthError(
            "REFRESH_TOKEN_EXPIRED",
            "Refresh token expire."
        );
    }

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

    user.refreshTokenHash = null;
    user.refreshTokenExpiresAt = null;
    user.lastLogoutAt = new Date();
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
        throw createAuthError("INVALID_INPUT", "Email invalide.");
    }

    const targetRole = AUTH_ROLE_VALUES.includes(role) ? role : "MEDECIN";

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

export async function listUsers({ authUser }) {
    assertSuperAdmin(authUser);

    const users = await AdminUser.find({})
        .select("username email role isActive createdAt lastLoginAt lastLogoutAt")
        .sort({ createdAt: -1 })
        .lean();

    return {
        users: users.map(mapPublicUser),
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
            throw createAuthError("INVALID_INPUT", "Nom d'utilisateur invalide.");
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
            throw createAuthError("USER_EXISTS", "Nom d'utilisateur deja utilise.");
        }
    }

    if (typeof next.email !== "undefined" && next.email !== user.email) {
        if (next.email) {
            const existingByEmail = await AdminUser.findOne({
                email: next.email,
                _id: { $ne: user._id },
            });
            if (existingByEmail) {
                throw createAuthError("USER_EXISTS", "Email deja utilise.");
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

    if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 128) {
        throw createAuthError("INVALID_INPUT", "Mot de passe invalide.");
    }

    const ip = getRequestIp(req);
    const user = await AdminUser.findById(userId);
    if (!user) {
        throw createAuthError("USER_NOT_FOUND", "Utilisateur introuvable.");
    }

    user.passwordHash = await hashPassword(newPassword);
    user.refreshTokenHash = null;
    user.refreshTokenExpiresAt = null;
    await user.save();

    await recordAuthAuditEvent({
        action: "USER_MANAGEMENT",
        outcome: "SUCCESS",
        userId: authUser.userId,
        username: authUser.username,
        role: authUser.role,
        ip,
        reason: `RESET_PASSWORD:${String(user._id)}`,
    });

    return {
        user: mapPublicUser(user),
    };
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
