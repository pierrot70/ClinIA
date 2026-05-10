import jwt from "jsonwebtoken";
import { AUTH_ROLE_VALUES } from "../auth/constants.js";
import { AdminUser } from "../models/AdminUser.js";
import {
    enforceScheduledShutdownIfDue,
    isShutdownEnforcedForRole,
} from "../services/appShutdown.js";
import { touchSessionActivity, validateSessionState } from "../services/auth.js";

function getJwtAccessSecret() {
    return process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
}

function getTokenFromRequest(req) {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
        return null;
    }

    return authHeader.slice("Bearer ".length).trim();
}

function isTokenRevokedByServer(user, payload) {
    if (!user?.authTokenInvalidBefore || !payload?.iat) {
        return false;
    }

    const issuedAtMs = Number(payload.iat) * 1000;
    return Number.isFinite(issuedAtMs) &&
        issuedAtMs <= new Date(user.authTokenInvalidBefore).getTime();
}

function isAllowedWhilePasswordResetRequired(req) {
    const path = req.originalUrl || req.path || req.url || "";
    const method = (req.method || "GET").toUpperCase();

    return (
        (method === "GET" && path.startsWith("/api/auth/session")) ||
        (method === "POST" && path.startsWith("/api/auth/logout"))
    );
}

function isAllowedWhileForcedPasswordChangePending(req) {
    const path = req.originalUrl || req.path || req.url || "";
    const method = (req.method || "GET").toUpperCase();

    return (
        (method === "GET" && path.startsWith("/api/auth/session")) ||
        (method === "POST" && path.startsWith("/api/auth/logout")) ||
        (method === "POST" && path.startsWith("/api/auth/complete-password-reset"))
    );
}

export async function verifyJWT(req, res, next) {
    const token = getTokenFromRequest(req);

    if (!token) {
        return res.status(401).json({
            error: {
                code: "UNAUTHORIZED",
                message: "Authentification requise.",
                retryable: false,
            },
        });
    }

    try {
        await enforceScheduledShutdownIfDue();

        const payload = jwt.verify(
            token,
            getJwtAccessSecret(),
            {
                algorithms: ["HS256"],
                issuer: "clinia-backend",
                audience: "clinia-app",
            }
        );

        if (
            !payload?.sub ||
            !AUTH_ROLE_VALUES.includes(payload.role)
        ) {
            throw new Error("Invalid JWT payload");
        }

        const userQuery = AdminUser.findById(payload.sub)
            .select("_id username role isActive authTokenInvalidBefore sessionStartedAt lastActivityAt refreshTokenHash refreshTokenExpiresAt lastLogoutAt passwordResetRequired mustChangePasswordOnNextLogin");
        const user =
            typeof userQuery?.lean === "function"
                ? await userQuery.lean()
                : await userQuery;

        if (!user || user.isActive === false) {
            return res.status(401).json({
                error: {
                    code: "ACCOUNT_INACTIVE",
                    message: "Compte inactif ou inaccessible.",
                    retryable: false,
                },
            });
        }

        if (user.role !== payload.role) {
            return res.status(401).json({
                error: {
                    code: "INVALID_TOKEN",
                    message: "Token d'acces invalide ou expire.",
                    retryable: false,
                },
            });
        }

        if (isTokenRevokedByServer(user, payload)) {
            return res.status(401).json({
                error: {
                    code: "TOKEN_REVOKED",
                    message: "Session invalidee. Reconnectez-vous.",
                    retryable: false,
                },
            });
        }

        try {
            await validateSessionState(user);
        } catch (err) {
            return res.status(401).json({
                error: {
                    code: err.code || "INVALID_TOKEN",
                    message: err.message || "Token d'acces invalide ou expire.",
                    retryable: false,
                },
            });
        }

        if (isShutdownEnforcedForRole(user.role)) {
            return res.status(401).json({
                error: {
                    code: "APP_SHUTDOWN",
                    message: "Application arretee par le SUPERADMIN.",
                    retryable: false,
                },
            });
        }

        if (
            user.passwordResetRequired === true &&
            !isAllowedWhilePasswordResetRequired(req)
        ) {
            return res.status(403).json({
                error: {
                    code: "PASSWORD_RESET_REQUIRED",
                    message:
                        "Un changement de mot de passe est requis avant de poursuivre.",
                    retryable: false,
                },
            });
        }

        if (
            user.mustChangePasswordOnNextLogin === true &&
            !isAllowedWhileForcedPasswordChangePending(req)
        ) {
            return res.status(403).json({
                error: {
                    code: "PASSWORD_CHANGE_REQUIRED",
                    message:
                        "Vous devez choisir un nouveau mot de passe avant de poursuivre.",
                    retryable: false,
                },
            });
        }

        req.auth = {
            userId: String(user._id),
            role: user.role,
            username: user.username,
            passwordResetRequired: user.passwordResetRequired === true,
            mustChangePasswordOnNextLogin:
                user.mustChangePasswordOnNextLogin === true,
        };

        await touchSessionActivity(user);
        return next();
    } catch {
        return res.status(401).json({
            error: {
                code: "INVALID_TOKEN",
                message: "Token d'acces invalide ou expire.",
                retryable: false,
            },
        });
    }
}
