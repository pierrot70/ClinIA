const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;
const MAX_VERIFICATIONS_PER_WINDOW = 15;

const requestBuckets = new Map();
const verificationBuckets = new Map();

function getClientIp(req) {
    const cloudflareIp = req.headers?.["cf-connecting-ip"];
    return (
        (typeof cloudflareIp === "string" && cloudflareIp.trim()) ||
        req.ip ||
        req.socket?.remoteAddress ||
        req.connection?.remoteAddress ||
        "unknown"
    );
}

function applyLimit({ req, res, next, buckets, maximum, code, message }) {
    const now = Date.now();
    const key = `ip:${getClientIp(req)}`;
    const bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
        buckets.set(key, {
            count: 1,
            resetAt: now + WINDOW_MS,
        });
        return next();
    }

    bucket.count += 1;
    if (bucket.count <= maximum) {
        return next();
    }

    const retryAfterSeconds = Math.max(
        1,
        Math.ceil((bucket.resetAt - now) / 1000)
    );
    res.setHeader("Retry-After", String(retryAfterSeconds));
    return res.status(429).json({
        error: {
            code,
            message,
            retryable: true,
        },
    });
}

export function passwordRecoveryRequestRateLimiter(req, res, next) {
    return applyLimit({
        req,
        res,
        next,
        buckets: requestBuckets,
        maximum: MAX_REQUESTS_PER_WINDOW,
        code: "PASSWORD_RECOVERY_REQUEST_RATE_LIMITED",
        message: "Trop de demandes. Reessayez dans 15 minutes.",
    });
}

export function passwordRecoveryVerifyRateLimiter(req, res, next) {
    return applyLimit({
        req,
        res,
        next,
        buckets: verificationBuckets,
        maximum: MAX_VERIFICATIONS_PER_WINDOW,
        code: "PASSWORD_RECOVERY_VERIFY_RATE_LIMITED",
        message: "Trop de tentatives. Reessayez dans 15 minutes.",
    });
}

export function resetPasswordRecoveryRateLimitersForTests() {
    requestBuckets.clear();
    verificationBuckets.clear();
}
