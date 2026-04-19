const WINDOW_MS = 15 * 60 * 1000;
const MAX_COMMENTS_PER_WINDOW = 5;

const rateLimitState = {
    windowStartedAt: 0,
    requestCount: 0,
    lockedUntil: 0,
};

function buildLimitedResponse(res) {
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

    if (rateLimitState.lockedUntil && now < rateLimitState.lockedUntil) {
        return buildLimitedResponse(res);
    }

    if (rateLimitState.lockedUntil && now >= rateLimitState.lockedUntil) {
        rateLimitState.windowStartedAt = 0;
        rateLimitState.requestCount = 0;
        rateLimitState.lockedUntil = 0;
    }

    if (
        rateLimitState.windowStartedAt === 0 ||
        now - rateLimitState.windowStartedAt >= WINDOW_MS
    ) {
        rateLimitState.windowStartedAt = now;
        rateLimitState.requestCount = 0;
    }

    rateLimitState.requestCount += 1;

    if (rateLimitState.requestCount > MAX_COMMENTS_PER_WINDOW) {
        rateLimitState.lockedUntil = now + WINDOW_MS;

        console.warn("🚨 CLINICIAN_COMMENTS_RATE_LIMITED", {
            requestCount: rateLimitState.requestCount,
            windowStartedAt: new Date(rateLimitState.windowStartedAt).toISOString(),
            lockedUntil: new Date(rateLimitState.lockedUntil).toISOString(),
            path: req.originalUrl || req.url || "/api/clinician-comments",
        });

        return buildLimitedResponse(res);
    }

    return next();
}

export function resetClinicianCommentRateLimiterForTests() {
    rateLimitState.windowStartedAt = 0;
    rateLimitState.requestCount = 0;
    rateLimitState.lockedUntil = 0;
}
