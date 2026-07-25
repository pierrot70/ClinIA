import { RateLimitWindow } from "../models/RateLimitWindow.js";
import { logSafeError } from "../utils/requestLogSafety.js";
import { getTrustedRequestIp } from "../utils/requestIp.js";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_LOOKUPS_PER_WINDOW = 10;
const LIMITER_KEY = "clinician_reply_lookup";

export function createClinicianReplyLookupRateLimiter({
    RateLimitWindowModel = RateLimitWindow,
    now = () => Date.now(),
} = {}) {
    return async function clinicianReplyLookupRateLimiter(req, res, next) {
        const nowMs = now();
        const actorKey = `ip:${getTrustedRequestIp(req)}`;
        const windowStartedAt = new Date(
            Math.floor(nowMs / WINDOW_MS) * WINDOW_MS
        );
        const expiresAt = new Date(windowStartedAt.getTime() + WINDOW_MS * 2);

        try {
            const bucket = await RateLimitWindowModel.findOneAndUpdate(
                { limiterKey: LIMITER_KEY, actorKey, windowStartedAt },
                {
                    $setOnInsert: {
                        limiterKey: LIMITER_KEY,
                        actorKey,
                        windowStartedAt,
                        windowMs: WINDOW_MS,
                        expiresAt,
                    },
                    $inc: { requestCount: 1 },
                },
                { upsert: true, new: true }
            );

            if (bucket.requestCount <= MAX_LOOKUPS_PER_WINDOW) {
                return next();
            }

            const retryAfterSeconds = Math.max(
                1,
                Math.ceil(
                    (windowStartedAt.getTime() + WINDOW_MS - nowMs) / 1000
                )
            );
            res.setHeader("Retry-After", String(retryAfterSeconds));

            logSafeError("CLINICIAN_REPLY_LOOKUP_RATE_LIMITED", null, {
                component: "rate_limiter",
                status: 429,
            });

            return res.status(429).json({
                error: {
                    code: "CLINICIAN_REPLY_LOOKUP_RATE_LIMITED",
                    message:
                        "Trop de tentatives de consultation. Reessayez dans 15 minutes.",
                    retryable: true,
                },
            });
        } catch (err) {
            logSafeError("CLINICIAN_REPLY_LOOKUP_RATE_LIMIT_CHECK_FAILED", err);
            return res.status(503).json({
                error: {
                    code: "CLINICIAN_REPLY_LOOKUP_RATE_LIMIT_UNAVAILABLE",
                    message:
                        "Le controle des consultations est temporairement indisponible.",
                    retryable: true,
                },
            });
        }
    };
}

export const clinicianReplyLookupRateLimiter =
    createClinicianReplyLookupRateLimiter();
