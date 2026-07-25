import {
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    LOGIN_RATE_LIMIT_WINDOW_MS,
    REFRESH_RATE_LIMIT_MAX_ATTEMPTS,
    REFRESH_RATE_LIMIT_WINDOW_MS,
} from "../auth/constants.js";
import { RateLimitWindow } from "../models/RateLimitWindow.js";
import { logSafeError } from "../utils/requestLogSafety.js";

const LOGIN_LIMITER_KEY = "auth_login";
const REFRESH_LIMITER_KEY = "auth_refresh";

function getClientIp(req) {
    const cloudflareIp = req.headers["cf-connecting-ip"];
    if (typeof cloudflareIp === "string" && cloudflareIp.trim()) {
        return cloudflareIp.trim();
    }

    const forwardedFor = req.headers["x-forwarded-for"];
    if (typeof forwardedFor === "string" && forwardedFor.trim()) {
        return forwardedFor.split(",")[0].trim();
    }

    return req.ip || req.socket?.remoteAddress || "unknown";
}

export function createLoginRateLimiter({
    RateLimitWindowModel = RateLimitWindow,
    now = () => Date.now(),
} = {}) {
    return async function loginRateLimiter(req, res, next) {
        const nowMs = now();
        const actorKey = `ip:${getClientIp(req)}`;
        const windowStartedAt = new Date(
            Math.floor(nowMs / LOGIN_RATE_LIMIT_WINDOW_MS) *
                LOGIN_RATE_LIMIT_WINDOW_MS
        );
        const expiresAt = new Date(
            windowStartedAt.getTime() + LOGIN_RATE_LIMIT_WINDOW_MS * 2
        );

        try {
            const bucket = await RateLimitWindowModel.findOneAndUpdate(
                {
                    limiterKey: LOGIN_LIMITER_KEY,
                    actorKey,
                    windowStartedAt,
                },
                {
                    $setOnInsert: {
                        limiterKey: LOGIN_LIMITER_KEY,
                        actorKey,
                        windowStartedAt,
                        windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
                        expiresAt,
                    },
                    $inc: { requestCount: 1 },
                },
                { upsert: true, new: true }
            );

            if (bucket.requestCount <= LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
                return next();
            }

            const retryAfterSeconds = Math.max(
                1,
                Math.ceil(
                    (windowStartedAt.getTime() +
                        LOGIN_RATE_LIMIT_WINDOW_MS -
                        nowMs) /
                        1000
                )
            );
            res.setHeader("Retry-After", String(retryAfterSeconds));
            return res.status(429).json({
                error: {
                    code: "RATE_LIMITED",
                    message:
                        "Trop de tentatives de connexion. Reessayez plus tard.",
                    retryable: true,
                },
            });
        } catch (err) {
            logSafeError("LOGIN_RATE_LIMIT_CHECK_FAILED", err);
            return res.status(503).json({
                error: {
                    code: "LOGIN_RATE_LIMIT_UNAVAILABLE",
                    message:
                        "Le controle des tentatives de connexion est temporairement indisponible.",
                    retryable: true,
                },
            });
        }
    };
}

export const loginRateLimiter = createLoginRateLimiter();

export function createRefreshRateLimiter({
    RateLimitWindowModel = RateLimitWindow,
    now = () => Date.now(),
} = {}) {
    return async function refreshRateLimiter(req, res, next) {
        const nowMs = now();
        const actorKey = `ip:${getClientIp(req)}`;
        const windowStartedAt = new Date(
            Math.floor(nowMs / REFRESH_RATE_LIMIT_WINDOW_MS) *
                REFRESH_RATE_LIMIT_WINDOW_MS
        );
        const expiresAt = new Date(
            windowStartedAt.getTime() + REFRESH_RATE_LIMIT_WINDOW_MS * 2
        );

        try {
            const bucket = await RateLimitWindowModel.findOneAndUpdate(
                {
                    limiterKey: REFRESH_LIMITER_KEY,
                    actorKey,
                    windowStartedAt,
                },
                {
                    $setOnInsert: {
                        limiterKey: REFRESH_LIMITER_KEY,
                        actorKey,
                        windowStartedAt,
                        windowMs: REFRESH_RATE_LIMIT_WINDOW_MS,
                        expiresAt,
                    },
                    $inc: { requestCount: 1 },
                },
                { upsert: true, new: true }
            );

            if (bucket.requestCount <= REFRESH_RATE_LIMIT_MAX_ATTEMPTS) {
                return next();
            }

            const retryAfterSeconds = Math.max(
                1,
                Math.ceil(
                    (windowStartedAt.getTime() +
                        REFRESH_RATE_LIMIT_WINDOW_MS -
                        nowMs) /
                        1000
                )
            );
            res.setHeader("Retry-After", String(retryAfterSeconds));
            return res.status(429).json({
                error: {
                    code: "RATE_LIMITED",
                    message:
                        "Trop de tentatives de rafraichissement. Reessayez plus tard.",
                    retryable: true,
                },
            });
        } catch (err) {
            logSafeError("REFRESH_RATE_LIMIT_CHECK_FAILED", err);
            return res.status(503).json({
                error: {
                    code: "REFRESH_RATE_LIMIT_UNAVAILABLE",
                    message:
                        "Le controle des rafraichissements est temporairement indisponible.",
                    retryable: true,
                },
            });
        }
    };
}

export const refreshRateLimiter = createRefreshRateLimiter();
