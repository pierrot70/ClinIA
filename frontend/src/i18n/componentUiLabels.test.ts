import { describe, expect, it } from "vitest";
import { COMPONENT_UI_SOURCES_FR, COMPONENT_UI_TRANSLATIONS, localizeComponentUiLabel } from "./componentUiLabels";

describe("local component UI translations", () => {
    it.each(["en", "es", "ko", "vi", "no", "ja", "zh", "he"])("covers all versioned component sources in %s", locale => {
        const translated = COMPONENT_UI_TRANSLATIONS[locale];
        expect(Object.keys(translated).sort()).toEqual(Object.keys(COMPONENT_UI_SOURCES_FR).sort());
        for (const [key, source] of Object.entries(COMPONENT_UI_SOURCES_FR)) {
            const value = translated[key as keyof typeof COMPONENT_UI_SOURCES_FR];
            expect(value.trim()).not.toBe("");
            expect(localizeComponentUiLabel(source, locale)).toBe(value);
            expect([...value.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort())
                .toEqual([...source.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort());
        }
    });
    it("returns no match for patient or clinical narrative", () => {
        expect(localizeComponentUiLabel("Patient synthetic narrative", "en")).toBeNull();
        expect(localizeComponentUiLabel(COMPONENT_UI_SOURCES_FR.jAiLuEtCompris, "de")).toBeNull();
        expect(localizeComponentUiLabel(COMPONENT_UI_SOURCES_FR.jAiLuEtCompris, "fr-CA"))
            .toBe(COMPONENT_UI_SOURCES_FR.jAiLuEtCompris);
    });
});
