import { RateLimitWindow } from "../models/RateLimitWindow.js";
import { logSafeError } from "../utils/requestLogSafety.js";
import { getTrustedRequestIp } from "../utils/requestIp.js";

export const ANONYMOUS_CLINICAL_DEMO_WINDOW_MS = 60_000;
export const ANONYMOUS_CLINICAL_DEMO_MAX_REQUESTS = 3;
const LIMITER_KEY = "anonymous_clinical_demo";

export function createClinicalDemoRateLimiter({
    RateLimitWindowModel = RateLimitWindow,
    now = () => Date.now(),
} = {}) {
    return async function clinicalDemoRateLimiter(req, res, next) {
        const nowMs = now();
        const actorKey = `ip:${getTrustedRequestIp(req)}`;
        const windowStartedAt = new Date(
            Math.floor(nowMs / ANONYMOUS_CLINICAL_DEMO_WINDOW_MS) *
                ANONYMOUS_CLINICAL_DEMO_WINDOW_MS
        );
        const expiresAt = new Date(
            windowStartedAt.getTime() + ANONYMOUS_CLINICAL_DEMO_WINDOW_MS * 2
        );

        try {
            const bucket = await RateLimitWindowModel.findOneAndUpdate(
                { limiterKey: LIMITER_KEY, actorKey, windowStartedAt },
                {
                    $setOnInsert: {
                        limiterKey: LIMITER_KEY,
                        actorKey,
                        windowStartedAt,
                        windowMs: ANONYMOUS_CLINICAL_DEMO_WINDOW_MS,
                        expiresAt,
                    },
                    $inc: { requestCount: 1 },
                },
                { upsert: true, new: true }
            );

            if (bucket.requestCount <= ANONYMOUS_CLINICAL_DEMO_MAX_REQUESTS) {
                return next();
            }

            const retryAfterSeconds = Math.max(
                1,
                Math.ceil(
                    (windowStartedAt.getTime() +
                        ANONYMOUS_CLINICAL_DEMO_WINDOW_MS -
                        nowMs) /
                        1000
                )
            );
            res.setHeader("Retry-After", String(retryAfterSeconds));
            return res.status(429).json({
                error: {
                    code: "ANONYMOUS_CLINICAL_DEMO_RATE_LIMITED",
                    message:
                        "Trop de requetes de demonstration. Reessayez dans quelques instants.",
                    retryable: true,
                },
            });
        } catch (err) {
            logSafeError("ANONYMOUS_CLINICAL_DEMO_QUOTA_CHECK_FAILED", err, {
                component: "rate_limiter",
            });
            return res.status(503).json({
                error: {
                    code: "ANONYMOUS_CLINICAL_DEMO_QUOTA_UNAVAILABLE",
                    message:
                        "Le controle des requetes de demonstration est temporairement indisponible.",
                    retryable: true,
                },
            });
        }
    };
}

export const clinicalDemoRateLimiter = createClinicalDemoRateLimiter();
