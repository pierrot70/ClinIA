import { RateLimitWindow } from "../models/RateLimitWindow.js";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_REPORTS_PER_WINDOW = 30;
const LIMITER_KEY = "csp_report";

function getClientIp(req) {
    const cloudflareIp = req.headers?.["cf-connecting-ip"];
    return (
        (typeof cloudflareIp === "string" && cloudflareIp.trim()) ||
        req.ip ||
        req.socket?.remoteAddress ||
        "unknown"
    );
}

export function createCspReportRateLimiter({
    RateLimitWindowModel = RateLimitWindow,
    now = () => Date.now(),
} = {}) {
    return async function cspReportRateLimiter(req, res, next) {
        const nowMs = now();
        const windowStartedAt = new Date(Math.floor(nowMs / WINDOW_MS) * WINDOW_MS);
        const expiresAt = new Date(windowStartedAt.getTime() + WINDOW_MS * 2);
        const actorKey = `ip:${getClientIp(req)}`;

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

            if (bucket.requestCount <= MAX_REPORTS_PER_WINDOW) {
                return next();
            }

            return res.status(204).end();
        } catch {
            // A reporting endpoint must fail closed without exposing internals.
            return res.status(204).end();
        }
    };
}

export const cspReportRateLimiter = createCspReportRateLimiter();
