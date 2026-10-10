// Single list shared by the selector, translation audit and page tests.
export const UI_LOCALES = ["fr-CA", "en-CA", "es", "ko-KR", "vi", "no-NO", "ja", "zh", "he"] as const;
export type UiLocale = typeof UI_LOCALES[number];

export function baseUiLocale(locale: string) {
    const base = locale.trim().toLowerCase().split("-")[0];
    if (["iw"].includes(base)) return "he";
    if (["nb", "nn"].includes(base)) return "no";
    return base;
}

export function normalizeUiLocale(locale: string): UiLocale {
    return UI_LOCALES.find(candidate => baseUiLocale(candidate) === baseUiLocale(locale)) ?? "en-CA";
}

export function placeholders(text: string) {
    return [...text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map(match => match[1]).sort();
}

export function validUiTranslation(source: string, translated: unknown): translated is string {
    return typeof translated === "string" && translated.trim().length > 0
        && JSON.stringify(placeholders(source)) === JSON.stringify(placeholders(translated));
}
