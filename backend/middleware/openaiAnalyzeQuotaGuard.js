import { RateLimitWindow } from "../models/RateLimitWindow.js";
import { logSafeError } from "../utils/requestLogSafety.js";
import { getTrustedRequestIp } from "../utils/requestIp.js";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;
const LIMITER_KEY = "openai_analyze";

function isProduction() {
    return process.env.NODE_ENV === "production";
}

function getQuotaKey(req) {
    if (req.auth?.userId) {
        return `user:${req.auth.userId}`;
    }

    return `ip:${getTrustedRequestIp(req)}`;
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
        storage: "mongo",
        maxRequestsPerWindow: MAX_REQUESTS_PER_WINDOW,
        windowMs: WINDOW_MS,
    };
}

export function createOpenAIAnalyzeQuotaGuard({
    RateLimitWindowModel = RateLimitWindow,
    now = () => Date.now(),
} = {}) {
    return async function openAIAnalyzeQuotaGuard(req, res, next) {
        if (!isProduction() || !req.auth?.userId) {
            return next();
        }

        const nowMs = now();
        const key = getQuotaKey(req);
        const windowStartedAt = new Date(
            Math.floor(nowMs / WINDOW_MS) * WINDOW_MS
        );
        const expiresAt = new Date(windowStartedAt.getTime() + WINDOW_MS * 2);

        try {
            const bucket = await RateLimitWindowModel.findOneAndUpdate(
                { limiterKey: LIMITER_KEY, actorKey: key, windowStartedAt },
                {
                    $setOnInsert: {
                        limiterKey: LIMITER_KEY,
                        actorKey: key,
                        windowStartedAt,
                        windowMs: WINDOW_MS,
                        expiresAt,
                    },
                    $inc: { requestCount: 1 },
                },
                { upsert: true, new: true }
            );

            if (bucket.requestCount <= MAX_REQUESTS_PER_WINDOW) {
                return next();
            }

            const retryAfterSeconds = Math.max(
                1,
                Math.ceil((windowStartedAt.getTime() + WINDOW_MS - nowMs) / 1000)
            );

            logSafeError("OPENAI_ANALYZE_RATE_LIMITED", null, {
                component: "rate_limiter",
                status: 429,
            });

            return buildRateLimitedResponse(res, retryAfterSeconds);
        } catch (err) {
            logSafeError("OPENAI_ANALYZE_QUOTA_CHECK_FAILED", err);
            return res.status(503).json({
                error: {
                    code: "OPENAI_ANALYZE_QUOTA_UNAVAILABLE",
                    message:
                        "Le controle du quota OpenAI est temporairement indisponible.",
                    retryable: true,
                },
            });
        }
    };
}

export const openAIAnalyzeQuotaGuard = createOpenAIAnalyzeQuotaGuard();
