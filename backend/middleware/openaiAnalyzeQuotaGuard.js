const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;

const quotaState = {
    windowStartedAt: 0,
    requestCount: 0,
    locked: false,
    lockedAt: 0,
};

function isProduction() {
    return process.env.NODE_ENV === "production";
}

function buildLockedResponse(res) {
    return res.status(503).json({
        error: {
            code: "OPENAI_ANALYZE_SATURATED",
            message:
                "clinique-ai.ca est sature pour l'analyse clinique. Reessayez plus tard.",
            retryable: true,
        },
    });
}

export function openAIAnalyzeQuotaGuard(req, res, next) {
    if (!isProduction()) {
        return next();
    }

    if (quotaState.locked) {
        return buildLockedResponse(res);
    }

    const now = Date.now();

    if (
        quotaState.windowStartedAt === 0 ||
        now - quotaState.windowStartedAt >= WINDOW_MS
    ) {
        quotaState.windowStartedAt = now;
        quotaState.requestCount = 0;
    }

    quotaState.requestCount += 1;

    if (quotaState.requestCount > MAX_REQUESTS_PER_WINDOW) {
        quotaState.locked = true;
        quotaState.lockedAt = now;

        console.error("🚨 OPENAI_ANALYZE_QUOTA_LOCKED", {
            requestCount: quotaState.requestCount,
            windowStartedAt: new Date(quotaState.windowStartedAt).toISOString(),
            lockedAt: new Date(quotaState.lockedAt).toISOString(),
            path: req.originalUrl || req.url || "/api/ai/analyze",
        });

        return buildLockedResponse(res);
    }

    return next();
}

export function resetOpenAIAnalyzeQuotaGuardForTests() {
    quotaState.windowStartedAt = 0;
    quotaState.requestCount = 0;
    quotaState.locked = false;
    quotaState.lockedAt = 0;
}

