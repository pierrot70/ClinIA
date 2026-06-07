const WINDOW_MS = 15 * 60 * 1000;
const MAX_COMMENTS_PER_WINDOW = 5;
const MAX_BUCKETS_BEFORE_CLEANUP = 1_000;

const rateLimitBuckets = new Map();

function getRateLimitKey(req) {
    if (req.auth?.userId) {
        return `user:${req.auth.userId}`;
    }

    const clientIp =
        req.ip ||
        req.socket?.remoteAddress ||
        req.connection?.remoteAddress ||
        "unknown";

    return `ip:${clientIp}`;
}

function cleanupExpiredBuckets(now) {
    if (rateLimitBuckets.size < MAX_BUCKETS_BEFORE_CLEANUP) {
        return;
    }

    for (const [key, bucket] of rateLimitBuckets.entries()) {
        if (now >= bucket.resetAt) {
            rateLimitBuckets.delete(key);
        }
    }
}

function buildLimitedResponse(res, resetAt, now) {
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfterSeconds));

    return res.status(429).json({
        error: {
            code: "CLINICIAN_COMMENTS_RATE_LIMITED",
            message:
                "Les commentaires sont temporairement bloques. Reessayez dans 15 minutes.",
            retryable: true,
        },
    });
}

export function clinicianCommentRateLimiter(req, res, next) {
    const now = Date.now();
    const key = getRateLimitKey(req);
    const bucket = rateLimitBuckets.get(key);

    cleanupExpiredBuckets(now);

    if (!bucket || now >= bucket.resetAt) {
        rateLimitBuckets.set(key, {
            requestCount: 1,
            resetAt: now + WINDOW_MS,
        });
        return next();
    }

    bucket.requestCount += 1;

    if (bucket.requestCount > MAX_COMMENTS_PER_WINDOW) {
        console.warn("🚨 CLINICIAN_COMMENTS_RATE_LIMITED", {
            key,
            requestCount: bucket.requestCount,
            resetAt: new Date(bucket.resetAt).toISOString(),
            path: req.originalUrl || req.url || "/api/clinician-comments",
        });

        return buildLimitedResponse(res, bucket.resetAt, now);
    }

    return next();
}

export function resetClinicianCommentRateLimiterForTests() {
    rateLimitBuckets.clear();
}
