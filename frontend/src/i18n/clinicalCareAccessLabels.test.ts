import { describe, expect, it } from "vitest";
import { UI_LABELS_FR } from "./uiLabels.fr";
import { UI_LOCALES, validUiTranslation } from "./uiLocales";
import { clinicalCareAccessLabels } from "./clinicalCareAccessLabels";
import { getLocalUiTranslation } from "./localUiTranslations";
describe("local clinical care sharing labels", () => {
    it.each(UI_LOCALES)("resolves every French-source label locally in %s", locale => {
        const labels = clinicalCareAccessLabels(locale);
        const mismatches: object[] = [];
        for (const [key, source] of Object.entries(UI_LABELS_FR.clinicalCareAccess)) {
            const value = labels[key as keyof typeof labels];
            expect(validUiTranslation(source, value)).toBe(true);
            const actual=getLocalUiTranslation(source, locale);
            if (actual !== value) mismatches.push({key, source, actual, expected: value});
        }
        expect(mismatches).toEqual([]);
    });
});
