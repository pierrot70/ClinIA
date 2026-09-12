import { RateLimitWindow } from "../models/RateLimitWindow.js";
import { CLINICAL_WRITE_CONCERN } from "../db/clinicalWriteConcern.js";
import { logSafeError } from "../utils/requestLogSafety.js";

export const REAUTH_WINDOW_MS = 15 * 60 * 1000;
export const REAUTH_MAX_ATTEMPTS = 5;

// Must run after verifyJWT. Count all attempts before bcrypt, including successes.
// A fixed Mongo window is shared across sessions, IP addresses and API instances.
export function createReauthRateLimiter({ RateLimitWindowModel = RateLimitWindow, now = () => Date.now() } = {}) {
    return async function reauthRateLimiter(req, res, next) {
        const userId = req.auth?.userId;
        if (typeof userId !== "string" || !userId) {
            return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentification requise.", retryable: false } });
        }
        const nowMs = now();
        const windowStartedAt = new Date(Math.floor(nowMs / REAUTH_WINDOW_MS) * REAUTH_WINDOW_MS);
        const query = { limiterKey: "auth_reauth", actorKey: `user:${userId}`, windowStartedAt };
        try {
            const bucket = await RateLimitWindowModel.findOneAndUpdate(query, {
                $setOnInsert: { ...query, windowMs: REAUTH_WINDOW_MS, expiresAt: new Date(windowStartedAt.getTime() + 2 * REAUTH_WINDOW_MS) },
                $inc: { requestCount: 1 },
            }, { upsert: true, returnDocument: "after", writeConcern: CLINICAL_WRITE_CONCERN });
            if (!Number.isSafeInteger(bucket?.requestCount) || bucket.requestCount < 1) throw new Error("INVALID_COUNTER");
            if (bucket.requestCount <= REAUTH_MAX_ATTEMPTS) return next();
            res.setHeader("Retry-After", String(Math.max(1, Math.ceil((windowStartedAt.getTime() + REAUTH_WINDOW_MS - nowMs) / 1000))));
            return res.status(429).json({ error: { code: "REAUTH_RATE_LIMITED",
                message: "Trop de tentatives de confirmation du mot de passe. Veuillez patienter avant de réessayer.", retryable: true } });
        } catch (err) {
            logSafeError("REAUTH_RATE_LIMIT_CHECK_FAILED", err);
            return res.status(503).json({ error: { code: "REAUTH_RATE_LIMIT_UNAVAILABLE",
                message: "La vérification des tentatives est temporairement indisponible. Veuillez réessayer plus tard.", retryable: true } });
        }
    };
}

export const reauthRateLimiter = createReauthRateLimiter();
