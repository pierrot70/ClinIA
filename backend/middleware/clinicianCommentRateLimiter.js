import { RateLimitWindow } from "../models/RateLimitWindow.js";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_COMMENTS_PER_WINDOW = 5;
const LIMITER_KEY = "clinician_comments";

function getRateLimitKey(req) {
    if (req.auth?.userId) {
        return `user:${req.auth.userId}`;
    }

    const cloudflareIp = req.headers?.["cf-connecting-ip"];
    const clientIp =
        (typeof cloudflareIp === "string" && cloudflareIp.trim()) ||
        req.ip ||
        req.socket?.remoteAddress ||
        req.connection?.remoteAddress ||
        "unknown";

    return `ip:${clientIp}`;
}

function buildLimitedResponse(res, windowStartedAt, nowMs) {
    const retryAfterSeconds = Math.max(
        1,
        Math.ceil((windowStartedAt.getTime() + WINDOW_MS - nowMs) / 1000)
    );
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

export function createClinicianCommentRateLimiter({
    RateLimitWindowModel = RateLimitWindow,
    now = () => Date.now(),
} = {}) {
    return async function clinicianCommentRateLimiter(req, res, next) {
        const nowMs = now();
        const actorKey = getRateLimitKey(req);
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

            if (bucket.requestCount <= MAX_COMMENTS_PER_WINDOW) {
                return next();
            }

            console.warn("CLINICIAN_COMMENTS_RATE_LIMITED", {
                actorKey,
                requestCount: bucket.requestCount,
                windowStartedAt: windowStartedAt.toISOString(),
                path: req.originalUrl || req.url || "/api/clinician-comments",
            });

            return buildLimitedResponse(res, windowStartedAt, nowMs);
        } catch (err) {
            console.error(
                "CLINICIAN_COMMENTS_RATE_LIMIT_CHECK_FAILED",
                err?.message
            );
            return res.status(503).json({
                error: {
                    code: "CLINICIAN_COMMENTS_RATE_LIMIT_UNAVAILABLE",
                    message:
                        "Le controle des commentaires est temporairement indisponible.",
                    retryable: true,
                },
            });
        }
    };
}

export const clinicianCommentRateLimiter =
    createClinicianCommentRateLimiter();
