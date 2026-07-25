import { RateLimitWindow } from "../models/RateLimitWindow.js";
import { logSafeError } from "../utils/requestLogSafety.js";
import { getTrustedRequestIp } from "../utils/requestIp.js";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;
const MAX_VERIFICATIONS_PER_WINDOW = 15;

export function createPasswordRecoveryRateLimiter({
    limiterKey,
    maximum,
    code,
    message,
    RateLimitWindowModel = RateLimitWindow,
    now = () => Date.now(),
}) {
    return async function passwordRecoveryRateLimiter(req, res, next) {
        const nowMs = now();
        const actorKey = `ip:${getTrustedRequestIp(req)}`;
        const windowStartedAt = new Date(
            Math.floor(nowMs / WINDOW_MS) * WINDOW_MS
        );
        const expiresAt = new Date(windowStartedAt.getTime() + WINDOW_MS * 2);

        try {
            const bucket = await RateLimitWindowModel.findOneAndUpdate(
                { limiterKey, actorKey, windowStartedAt },
                {
                    $setOnInsert: {
                        limiterKey,
                        actorKey,
                        windowStartedAt,
                        windowMs: WINDOW_MS,
                        expiresAt,
                    },
                    $inc: { requestCount: 1 },
                },
                { upsert: true, new: true }
            );

            if (bucket.requestCount <= maximum) {
                return next();
            }

            const retryAfterSeconds = Math.max(
                1,
                Math.ceil(
                    (windowStartedAt.getTime() + WINDOW_MS - nowMs) / 1000
                )
            );
            res.setHeader("Retry-After", String(retryAfterSeconds));
            return res.status(429).json({
                error: {
                    code,
                    message,
                    retryable: true,
                },
            });
        } catch (err) {
            logSafeError("PASSWORD_RECOVERY_RATE_LIMIT_CHECK_FAILED", err, {
                component: "rate_limiter",
            });
            return res.status(503).json({
                error: {
                    code: "PASSWORD_RECOVERY_RATE_LIMIT_UNAVAILABLE",
                    message:
                        "Le controle de recuperation du mot de passe est temporairement indisponible.",
                    retryable: true,
                },
            });
        }
    };
}

export const passwordRecoveryRequestRateLimiter =
    createPasswordRecoveryRateLimiter({
        limiterKey: "password_recovery_request",
        maximum: MAX_REQUESTS_PER_WINDOW,
        code: "PASSWORD_RECOVERY_REQUEST_RATE_LIMITED",
        message: "Trop de demandes. Reessayez dans 15 minutes.",
    });

export const passwordRecoveryVerifyRateLimiter =
    createPasswordRecoveryRateLimiter({
        limiterKey: "password_recovery_verify",
        maximum: MAX_VERIFICATIONS_PER_WINDOW,
        code: "PASSWORD_RECOVERY_VERIFY_RATE_LIMITED",
        message: "Trop de tentatives. Reessayez dans 15 minutes.",
    });
