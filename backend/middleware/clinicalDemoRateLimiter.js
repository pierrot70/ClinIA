// middleware/clinicalDemoRateLimiter.js
// Limite à 1 requête/seconde par IP sur /api/ai/analyze pour les accès non authentifiés (ex: clinical-demo)

const buckets = new Map();
const WINDOW_MS = 1000; // 1 seconde
const MAX_ATTEMPTS = 1;

function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.connection?.remoteAddress ||
    req.ip ||
    "unknown"
  );
}

export function clinicalDemoRateLimiter(req, res, next) {
  const key = getClientIp(req);
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });
    return next();
  }

  bucket.count += 1;
  if (bucket.count > MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(retryAfterSeconds));
    return res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Trop de requêtes sur l'analyse clinique démo. Attendez 1 seconde.",
        retryable: true,
      },
    });
  }

  return next();
}
