import { describe, expect, it } from "vitest";
import { UI_LABELS_FR } from "./uiLabels.fr";
import { clinicalDemoUiRows, localizeClinicalDemoUiLabel } from "./clinicalDemoUiLabels";
import { UI_LOCALES, validUiTranslation } from "./uiLocales";
function leaves(value: unknown, prefix = ""): [string, string][] {
    if (typeof value === "string") return [[prefix, value]];
    return value && typeof value === "object" ? Object.entries(value).flatMap(([key, entry]) => leaves(entry, prefix ? `${prefix}.${key}` : key)) : [];
}
describe("clinical demo fixed interface translations", () => {
    it("covers every clinicalDemo leaf for every selectable language", () => {
        const missing: string[] = [];
        for (const [key, source] of leaves(UI_LABELS_FR.clinicalDemo)) for (const locale of UI_LOCALES) {
            if (!validUiTranslation(source, localizeClinicalDemoUiLabel(source, locale))) missing.push(`${key}: ${locale}: ${source}`);
        }
        expect(missing).toEqual([]);
    });
    it("provides all columns and preserves placeholders", () => {
        for (const row of clinicalDemoUiRows) {
            expect(row).toHaveLength(9);
            for (const translation of row) expect(validUiTranslation(row[0], translation)).toBe(true);
        }
    });
    it("excludes dynamic clinical and patient text", () => {
        expect(localizeClinicalDemoUiLabel("unregistered patient narrative", "en-CA")).toBeNull();
    });
});
