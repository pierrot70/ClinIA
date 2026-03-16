import jwt from "jsonwebtoken";
import { AUTH_ROLE_VALUES } from "../auth/constants.js";

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

export function verifyJWT(req, res, next) {
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

        req.auth = {
            userId: payload.sub,
            role: payload.role,
            username: payload.username,
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
