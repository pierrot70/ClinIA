import jwt from "jsonwebtoken";
import { AUTH_ROLE_VALUES } from "../auth/constants.js";
import { AdminUser } from "../models/AdminUser.js";
import {
    enforceScheduledShutdownIfDue,
    isShutdownEnforcedForRole,
} from "../services/appShutdown.js";

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

        const user = await AdminUser.findById(payload.sub)
            .select("_id username role isActive")
            .lean();

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

        if (isShutdownEnforcedForRole(user.role)) {
            return res.status(401).json({
                error: {
                    code: "APP_SHUTDOWN",
                    message: "Application arretee par le SUPERADMIN.",
                    retryable: false,
                },
            });
        }

        req.auth = {
            userId: String(user._id),
            role: user.role,
            username: user.username,
        };
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
