import { describe, expect, it, vi } from "vitest";
import { labels } from "./uiLabels";
import { walkInGuideLabels, walkInGuideTranslations } from "./walkInGuideLabels";

describe("local WalkIn guide labels", () => {
    it.each(["fr-CA", "en-CA", "es", "ko-KR", "vi", "no-NO", "ja", "zh", "he"])("provides complete static labels and progress placeholders in %s", locale => {
        const translated = walkInGuideLabels(locale);
        expect(Object.keys(translated).sort()).toEqual(Object.keys(labels.walkInGuide).sort());
        expect(Object.values(translated).every(value => value.trim().length > 0)).toBe(true);
        expect(translated.progress.match(/\{[a-z]+\}/g)?.sort()).toEqual(["{current}", "{total}"]);
        expect(translated.privacy).toContain("OpenAI");
        expect(translated.privacy).toContain("ClinIA");
        if (locale !== "fr-CA") {
            expect(translated.lookupDescription).not.toBe(labels.walkInGuide.lookupDescription);
            expect(translated.reviewDescription).not.toBe(labels.walkInGuide.reviewDescription);
            expect(translated.lookupProblemDescription).not.toBe(labels.walkInGuide.lookupProblemDescription);
        }
    });

    it("handles locale case and falls back to the versioned French source", () => {
        expect(walkInGuideLabels("EN-ca")).toBe(walkInGuideTranslations.en);
        expect(walkInGuideLabels("unknown")).toBe(labels.walkInGuide);
    });

    it("resolves every supported language without network calls", () => {
        const fetch = vi.fn(() => { throw new Error("The guide must remain local"); });
        vi.stubGlobal("fetch", fetch);
        try {
            Object.keys(walkInGuideTranslations).forEach(locale => walkInGuideLabels(locale));
            expect(fetch).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
