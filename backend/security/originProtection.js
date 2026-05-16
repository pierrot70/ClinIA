const DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
];

function normalizeOrigin(candidate) {
    if (typeof candidate !== "string" || !candidate.trim()) {
        return null;
    }

    try {
        return new URL(candidate.trim()).origin;
    } catch {
        return null;
    }
}

export function getAllowedOriginsFromEnv(env = process.env) {
    const configuredOrigins = String(env.CLINIA_ALLOWED_ORIGINS || "")
        .split(",")
        .map((origin) => normalizeOrigin(origin))
        .filter(Boolean);

    if (configuredOrigins.length > 0) {
        return new Set(configuredOrigins);
    }

    return new Set(DEFAULT_ALLOWED_ORIGINS);
}

export function isOriginAllowed(origin, allowedOrigins = getAllowedOriginsFromEnv()) {
    const normalizedOrigin = normalizeOrigin(origin);
    if (!normalizedOrigin) {
        return false;
    }

    return allowedOrigins.has(normalizedOrigin);
}

export function createCorsOriginDelegate(
    allowedOrigins = getAllowedOriginsFromEnv()
) {
    return function corsOriginDelegate(origin, callback) {
        if (!origin || isOriginAllowed(origin, allowedOrigins)) {
            callback(null, true);
            return;
        }

        const error = new Error("Not allowed by CORS");
        error.code = "CORS_ORIGIN_DENIED";
        error.status = 403;
        callback(error);
    };
}

export function getRequestOrigin(req) {
    const originHeader = req?.headers?.origin;
    if (typeof originHeader === "string" && originHeader.trim()) {
        return normalizeOrigin(originHeader);
    }

    const refererHeader = req?.headers?.referer;
    if (typeof refererHeader === "string" && refererHeader.trim()) {
        return normalizeOrigin(refererHeader);
    }

    return null;
}

function hasCookieHeader(req) {
    return typeof req?.headers?.cookie === "string" && req.headers.cookie.trim();
}

export function enforceTrustedOrigin(
    allowedOrigins = getAllowedOriginsFromEnv()
) {
    return function trustedOriginMiddleware(req, res, next) {
        const requestOrigin = getRequestOrigin(req);

        if (!requestOrigin) {
            if (!hasCookieHeader(req)) {
                return next();
            }

            return res.status(403).json({
                error: {
                    code: "UNTRUSTED_ORIGIN",
                    message:
                        "Origine de requete non verifiee pour cette action sensible.",
                    retryable: false,
                },
            });
        }

        if (isOriginAllowed(requestOrigin, allowedOrigins)) {
            return next();
        }

        return res.status(403).json({
            error: {
                code: "UNTRUSTED_ORIGIN",
                message:
                    "Origine de requete non autorisee pour cette action sensible.",
                retryable: false,
            },
        });
    };
}
