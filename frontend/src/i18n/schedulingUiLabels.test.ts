import { describe, expect, it } from "vitest";
import { UI_LABELS_FR } from "./uiLabels.fr";
import { SCHEDULING_UI_SOURCES_FR, SCHEDULING_UI_TRANSLATIONS, localizeSchedulingUiLabel } from "./schedulingUiLabels";

const locales = ["en", "es", "ko", "vi", "no", "ja", "zh", "he"];
function leafStrings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (!value || typeof value !== "object") return [];
    return Object.values(value).flatMap(leafStrings);
}

describe("local scheduling UI translations", () => {
    it("derives every source from the existing French registry", () => {
        const versionedSources = new Set(leafStrings(UI_LABELS_FR));
        expect(Object.values(SCHEDULING_UI_SOURCES_FR).every(source => versionedSources.has(source))).toBe(true);
        expect(Object.keys(SCHEDULING_UI_SOURCES_FR)).toHaveLength(298);
    });
    it.each(locales)("covers all sources and preserves template fields in %s", locale => {
        const dictionary = SCHEDULING_UI_TRANSLATIONS[locale];
        expect(Object.keys(dictionary).sort()).toEqual(Object.keys(SCHEDULING_UI_SOURCES_FR).sort());
        for (const [key, source] of Object.entries(SCHEDULING_UI_SOURCES_FR)) {
            const translated = dictionary[key as keyof typeof SCHEDULING_UI_SOURCES_FR];
            expect(translated.trim()).not.toBe("");
            expect(localizeSchedulingUiLabel(source, locale)).toBe(translated);
            expect([...translated.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort())
                .toEqual([...source.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort());
        }
    });
    it("leaves language autonyms recognizable in every locale", () => {
        for (const locale of locales) {
            expect(localizeSchedulingUiLabel(UI_LABELS_FR.patientsPage.form.languageOptions.korean, locale))
                .toBe(UI_LABELS_FR.patientsPage.form.languageOptions.korean);
            expect(localizeSchedulingUiLabel(UI_LABELS_FR.patientsPage.form.languageOptions.hebrew, locale))
                .toBe(UI_LABELS_FR.patientsPage.form.languageOptions.hebrew);
        }
    });
    it.each(locales)("uses localized calendar month names in %s", locale => {
        expect(localizeSchedulingUiLabel(UI_LABELS_FR.specialistsPage.months.january, locale))
            .toBe(new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date("2026-01-01T00:00:00Z")));
    });
    it("supports regional locales without translating arbitrary narratives", () => {
        expect(localizeSchedulingUiLabel(UI_LABELS_FR.clinicalSymptomLabels.Headache, "ko-KR")).toBe("두통");
        expect(localizeSchedulingUiLabel(UI_LABELS_FR.clinicalSymptomLabels.Headache, "fr-CA")).toBe("Céphalée");
        expect(localizeSchedulingUiLabel("Synthetic patient clinical narrative", "en")).toBeNull();
        expect(localizeSchedulingUiLabel(UI_LABELS_FR.clinicalSymptomLabels.Headache, "de")).toBeNull();
    });
});
