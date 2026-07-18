const MONGO_OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const UUID_PATTERN = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const LONG_OPAQUE_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{32,}$/;

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
        name: typeof error?.name === "string" ? error.name : "Error",
        code: typeof error?.code === "string" ? error.code : null,
    };
}
