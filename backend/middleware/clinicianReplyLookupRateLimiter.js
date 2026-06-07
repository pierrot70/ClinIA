const WINDOW_MS = 15 * 60 * 1000;
const MAX_LOOKUPS_PER_WINDOW = 10;
const MAX_BUCKETS_BEFORE_CLEANUP = 1_000;

const lookupBuckets = new Map();

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

function cleanupExpiredBuckets(now) {
    if (lookupBuckets.size < MAX_BUCKETS_BEFORE_CLEANUP) {
        return;
    }

    for (const [key, bucket] of lookupBuckets.entries()) {
        if (now >= bucket.resetAt) {
            lookupBuckets.delete(key);
        }
    }
}

export function clinicianReplyLookupRateLimiter(req, res, next) {
    const now = Date.now();
    const key = `ip:${getClientIp(req)}`;
    const bucket = lookupBuckets.get(key);

    cleanupExpiredBuckets(now);

    if (!bucket || now >= bucket.resetAt) {
        lookupBuckets.set(key, {
            requestCount: 1,
            resetAt: now + WINDOW_MS,
        });
        return next();
    }

    bucket.requestCount += 1;
    if (bucket.requestCount <= MAX_LOOKUPS_PER_WINDOW) {
        return next();
    }

    const retryAfterSeconds = Math.max(
        1,
        Math.ceil((bucket.resetAt - now) / 1000)
    );
    res.setHeader("Retry-After", String(retryAfterSeconds));

    console.warn("CLINICIAN_REPLY_LOOKUP_RATE_LIMITED", {
        key,
        requestCount: bucket.requestCount,
        resetAt: new Date(bucket.resetAt).toISOString(),
        path: req.originalUrl || req.url || "/api/clinician-comments/lookup-replies",
    });

    return res.status(429).json({
        error: {
            code: "CLINICIAN_REPLY_LOOKUP_RATE_LIMITED",
            message:
                "Trop de tentatives de consultation. Reessayez dans 15 minutes.",
            retryable: true,
        },
    });
}

export function resetClinicianReplyLookupRateLimiterForTests() {
    lookupBuckets.clear();
}
