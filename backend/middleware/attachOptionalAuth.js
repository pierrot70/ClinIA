import jwt from "jsonwebtoken";
import { AUTH_ROLE_VALUES } from "../auth/constants.js";
import { AdminUser } from "../models/AdminUser.js";

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

export async function attachOptionalAuth(req, res, next) {
    const token = getTokenFromRequest(req);

    if (!token) {
        return next();
    }

    try {
        const payload = jwt.verify(token, getJwtAccessSecret(), {
            algorithms: ["HS256"],
            issuer: "clinia-backend",
            audience: "clinia-app",
        });

        if (!payload?.sub || !AUTH_ROLE_VALUES.includes(payload.role)) {
            return next();
        }

        const user = await AdminUser.findById(payload.sub)
            .select("_id username role isActive authTokenInvalidBefore")
            .lean();

        if (
            !user ||
            user.isActive === false ||
            user.role !== payload.role ||
            isTokenRevokedByServer(user, payload)
        ) {
            return next();
        }

        req.auth = {
            userId: String(user._id),
            role: user.role,
            username: user.username,
        };
    } catch {
        // Never block analyze flow when auth is optional.
    }

    return next();
}
