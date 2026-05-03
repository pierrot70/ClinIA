import jwt from "jsonwebtoken";
import { SENSITIVE_REAUTH_COOKIE_NAME, parseCookies } from "../auth/sessionCookies.js";

function getJwtAccessSecret() {
    return process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
}

export function requireRecentReauth(req, res, next) {
    const cookies = parseCookies(req.headers.cookie);
    const reauthToken = cookies[SENSITIVE_REAUTH_COOKIE_NAME];

    if (!reauthToken || !req.auth?.userId) {
        return res.status(403).json({
            error: {
                code: "REAUTH_REQUIRED",
                message: "Veuillez reconfirmer votre mot de passe pour cette action sensible.",
                retryable: false,
            },
        });
    }

    try {
        const payload = jwt.verify(reauthToken, getJwtAccessSecret(), {
            algorithms: ["HS256"],
            issuer: "clinia-backend",
            audience: "clinia-sensitive-reauth",
        });

        if (
            payload?.sub !== req.auth.userId ||
            payload?.purpose !== "sensitive-reauth"
        ) {
            throw new Error("Invalid reauth token");
        }

        return next();
    } catch {
        return res.status(403).json({
            error: {
                code: "REAUTH_REQUIRED",
                message: "Veuillez reconfirmer votre mot de passe pour cette action sensible.",
                retryable: false,
            },
        });
    }
}
