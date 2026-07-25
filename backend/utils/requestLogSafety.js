const MONGO_OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const UUID_PATTERN = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const LONG_OPAQUE_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{32,}$/;
const SAFE_LOG_TOKEN_PATTERN = /^[A-Za-z0-9_.:-]{1,96}$/;
const SAFE_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;
const SAFE_ERROR_NAMES = new Set([
    "Error",
    "TypeError",
    "RangeError",
    "SyntaxError",
    "ValidationError",
    "CastError",
    "MongooseError",
    "MongoServerError",
    "MongoNetworkError",
    "OpenAIError",
    "APIError",
]);
const SAFE_LOG_CONTEXT_KEYS = new Set([
    "requestId",
    "instanceId",
    "operation",
    "component",
    "phase",
    "status",
]);

function normalizePathname(value) {
    const raw = String(value || "").trim();

    if (!raw) {
        return null;
    }

    try {
        return new URL(raw, "http://clinia.invalid").pathname || "/";
    } catch {
        return raw.split(/[?#]/, 1)[0] || "/";
    }
}

function redactOpaqueSegments(pathname) {
    return pathname
        .split("/")
        .map((segment) => {
            if (
                MONGO_OBJECT_ID_PATTERN.test(segment) ||
                UUID_PATTERN.test(segment) ||
                LONG_OPAQUE_SEGMENT_PATTERN.test(segment)
            ) {
                return ":id";
            }

            return segment;
        })
        .join("/");
}

// Query values and opaque identifiers are not appropriate for operational logs.
export function getSafeRequestPath(req, fallback = null) {
    const source =
        req && typeof req === "object"
            ? req.baseUrl && req.path
                ? `${req.baseUrl}${req.path}`
                : req.originalUrl || req.path || req.url
            : req;
    const pathname = normalizePathname(source);

    return pathname ? redactOpaqueSegments(pathname) : fallback;
}

export function getSafeErrorMetadata(error) {
    return {
        name:
            typeof error?.name === "string" &&
            SAFE_ERROR_NAMES.has(error.name)
                ? error.name
                : "Error",
        code:
            typeof error?.code === "string" &&
            SAFE_ERROR_CODE_PATTERN.test(error.code)
                ? error.code
                : null,
    };
}

function getSafeLogContext(context) {
    if (!context || typeof context !== "object") {
        return {};
    }

    return Object.fromEntries(
        Object.entries(context).flatMap(([key, value]) => {
            if (!SAFE_LOG_CONTEXT_KEYS.has(key)) {
                return [];
            }

            if (typeof value === "number" && Number.isFinite(value)) {
                return [[key, value]];
            }

            if (
                typeof value === "string" &&
                SAFE_LOG_TOKEN_PATTERN.test(value)
            ) {
                return [[key, value]];
            }

            return [];
        })
    );
}

// Error messages, stacks and arbitrary context may contain patient data. Keep
// operational logs limited to a stable event and explicitly safe metadata.
export function logSafeError(event, error, { logger = console, ...context } = {}) {
    const safeEvent =
        typeof event === "string" && SAFE_LOG_TOKEN_PATTERN.test(event)
            ? event
            : "UNKNOWN_ERROR";

    logger.error("CLINIA_SAFE_ERROR", {
        event: safeEvent,
        ...getSafeErrorMetadata(error),
        ...getSafeLogContext(context),
    });
}
