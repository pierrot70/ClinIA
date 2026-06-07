const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;

const quotaBuckets = new Map();

function isProduction() {
    return process.env.NODE_ENV === "production";
}

function getQuotaKey(req) {
    if (req.auth?.userId) {
        return `user:${req.auth.userId}`;
    }

    const forwardedFor = req.headers?.["x-forwarded-for"];
    const ip =
        typeof forwardedFor === "string" && forwardedFor.trim()
            ? forwardedFor.split(",")[0].trim()
            : req.ip || req.connection?.remoteAddress || "unknown";

    return `ip:${ip}`;
}

function buildRateLimitedResponse(res, retryAfterSeconds) {
    res.setHeader("Retry-After", String(retryAfterSeconds));
    return res.status(429).json({
        error: {
            code: "OPENAI_ANALYZE_RATE_LIMITED",
            message:
                "Trop d'analyses cliniques. Reessayez dans quelques instants.",
            retryable: true,
        },
    });
}

export function getOpenAIAnalyzeQuotaStatus() {
    return {
        enabled: isProduction(),
        state: "open",
        locked: false,
        activeBuckets: quotaBuckets.size,
        maxRequestsPerWindow: MAX_REQUESTS_PER_WINDOW,
        windowMs: WINDOW_MS,
    };
}

export function openAIAnalyzeQuotaGuard(req, res, next) {
    if (!isProduction() || !req.auth?.userId) {
        return next();
    }

    const now = Date.now();
    const key = getQuotaKey(req);
    let bucket = quotaBuckets.get(key);

    if (
        !bucket ||
        now - bucket.windowStartedAt >= WINDOW_MS
    ) {
        bucket = {
            windowStartedAt: now,
            requestCount: 0,
        };
        quotaBuckets.set(key, bucket);
    }

    bucket.requestCount += 1;

    if (bucket.requestCount > MAX_REQUESTS_PER_WINDOW) {
        const retryAfterSeconds = Math.max(
            1,
            Math.ceil((bucket.windowStartedAt + WINDOW_MS - now) / 1000)
        );

        console.warn("OPENAI_ANALYZE_RATE_LIMITED", {
            key,
            requestCount: bucket.requestCount,
            windowStartedAt: new Date(bucket.windowStartedAt).toISOString(),
            path: req.originalUrl || req.url || "/api/ai/analyze",
        });

        return buildRateLimitedResponse(res, retryAfterSeconds);
    }

    return next();
}

export function resetOpenAIAnalyzeQuotaGuardForTests() {
    quotaBuckets.clear();
}
