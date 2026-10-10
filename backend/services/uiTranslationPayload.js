function placeholders(text) {
    // Versioned UI labels use named {parameter} tokens. Compare multiplicity too.
    return (text.match(/\{[A-Za-z_][A-Za-z0-9_]*\}/g) || []).sort();
}

export function isValidUiTranslationPayload(payload, sourceText) {
    if (typeof sourceText !== "string" || !sourceText.trim()) return false;
    if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
        typeof payload.text !== "string" || !payload.text.trim()) return false;
    return JSON.stringify(placeholders(payload.text)) === JSON.stringify(placeholders(sourceText));
}
