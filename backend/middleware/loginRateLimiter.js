import {
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    LOGIN_RATE_LIMIT_WINDOW_MS,
    REFRESH_RATE_LIMIT_MAX_ATTEMPTS,
    REFRESH_RATE_LIMIT_WINDOW_MS,
} from "../auth/constants.js";

const requestBuckets = new Map();
const refreshBuckets = new Map();

function getClientIp(req) {
    const forwardedFor = req.headers["x-forwarded-for"];
    if (typeof forwardedFor === "string" && forwardedFor.trim()) {
        return forwardedFor.split(",")[0].trim();
    }

    return req.ip || req.socket?.remoteAddress || "unknown";
}

export function loginRateLimiter(req, res, next) {
    const key = getClientIp(req);
    const now = Date.now();
    const bucket = requestBuckets.get(key);

    if (!bucket || now > bucket.resetAt) {
        requestBuckets.set(key, {
            count: 1,
            resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS,
        });
        return next();
    }

    bucket.count += 1;
    if (bucket.count > LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
        const retryAfterSeconds = Math.ceil(
            (bucket.resetAt - now) / 1000
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
    }

    return next();
}

export function refreshRateLimiter(req, res, next) {
    const key = getClientIp(req);
    const now = Date.now();
    const bucket = refreshBuckets.get(key);

    if (!bucket || now > bucket.resetAt) {
        refreshBuckets.set(key, {
            count: 1,
            resetAt: now + REFRESH_RATE_LIMIT_WINDOW_MS,
        });
        return next();
    }

    bucket.count += 1;
    if (bucket.count > REFRESH_RATE_LIMIT_MAX_ATTEMPTS) {
        const retryAfterSeconds = Math.ceil(
            (bucket.resetAt - now) / 1000
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
    }

    return next();
}
