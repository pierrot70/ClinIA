const MAX_STRING_LENGTH = 2000;

const PROMPT_INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?previous\s+instructions?/i,
    /disregard\s+(all\s+)?(prior|previous)\s+instructions?/i,
    /system\s*prompt/i,
    /you\s+are\s+now\s+/i,
    /reveal\s+(the\s+)?(system|hidden)\s+prompt/i,
    /developer\s+message/i,
    /jailbreak/i,
];

function isBlockedKey(key) {
    if (typeof key !== "string") {
        return true;
    }

    if (key === "__proto__" || key === "constructor" || key === "prototype") {
        return true;
    }

    return key.startsWith("$") || key.includes(".");
}

function sanitizeString(value) {
    const asString = String(value ?? "").slice(0, MAX_STRING_LENGTH);

    return asString
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/javascript:/gi, "")
        .replace(/on[a-z]+\s*=\s*["'][^"']*["']/gi, "")
        .trim();
}

function sanitizeNode(node) {
    if (node === null || node === undefined) {
        return node;
    }

    if (typeof node === "string") {
        return sanitizeString(node);
    }

    if (typeof node === "number" || typeof node === "boolean") {
        return node;
    }

    if (Array.isArray(node)) {
        return node.map((item) => sanitizeNode(item));
    }

    if (typeof node === "object") {
        const out = {};
        for (const [key, value] of Object.entries(node)) {
            if (isBlockedKey(key)) {
                continue;
            }
            out[key] = sanitizeNode(value);
        }
        return out;
    }

    return undefined;
}

function collectStrings(node, into) {
    if (typeof node === "string") {
        into.push(node);
        return;
    }

    if (Array.isArray(node)) {
        for (const item of node) {
            collectStrings(item, into);
        }
        return;
    }

    if (node && typeof node === "object") {
        for (const value of Object.values(node)) {
            collectStrings(value, into);
        }
    }
}

export function sanitizeRequestPayload(payload) {
    return sanitizeNode(payload);
}

export function detectPromptInjection(payload) {
    const values = [];
    collectStrings(payload, values);

    for (const value of values) {
        for (const pattern of PROMPT_INJECTION_PATTERNS) {
            if (pattern.test(value)) {
                return {
                    hasMatch: true,
                    pattern: pattern.source,
                };
            }
        }
    }

    return {
        hasMatch: false,
        pattern: null,
    };
}
