import { RateLimitWindow } from "../models/RateLimitWindow.js";
import { getSafeRequestPath } from "../utils/requestLogSafety.js";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_LOOKUPS_PER_WINDOW = 10;
const LIMITER_KEY = "clinician_reply_lookup";

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

export function createClinicianReplyLookupRateLimiter({
    RateLimitWindowModel = RateLimitWindow,
    now = () => Date.now(),
} = {}) {
    return async function clinicianReplyLookupRateLimiter(req, res, next) {
        const nowMs = now();
        const actorKey = `ip:${getClientIp(req)}`;
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

            console.warn("CLINICIAN_REPLY_LOOKUP_RATE_LIMITED", {
                actorKey,
                requestCount: bucket.requestCount,
                windowStartedAt: windowStartedAt.toISOString(),
                path: getSafeRequestPath(
                    req,
                    "/api/clinician-comments/lookup-replies"
                ),
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
            console.error(
                "CLINICIAN_REPLY_LOOKUP_RATE_LIMIT_CHECK_FAILED",
                err?.message
            );
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
