import { describe, expect, it } from "vitest";
import { UI_LABELS_FR } from "./uiLabels.fr";
import { clinicalUiGroups, clinicalUiRows, localizeClinicalUiLabel } from "./clinicalUiLabels";
import { UI_LOCALES, validUiTranslation } from "./uiLocales";
function leaves(value: unknown): string[] {
    if (typeof value === "string") return [value];
    return value && typeof value === "object" ? Object.values(value).flatMap(leaves) : [];
}
describe("fixed clinical interface translation coverage", () => {
    it("covers every leaf of the assigned clinical and audit groups in every offered language", () => {
        const missing: string[] = [];
        for (const group of clinicalUiGroups) for (const source of leaves(UI_LABELS_FR[group])) {
            for (const locale of UI_LOCALES) {
                if (!validUiTranslation(source, localizeClinicalUiLabel(source, locale))) missing.push(`${group}: ${locale}: ${source}`);
            }
        }
        expect(missing).toEqual([]);
    });
    it("keeps every row complete and preserves interpolation parameters", () => {
        for (const row of clinicalUiRows) {
            expect(row).toHaveLength(9);
            for (const translation of row) expect(validUiTranslation(row[0], translation)).toBe(true);
        }
    });
    it("leaves arbitrary clinical content outside the resolver", () => {
        expect(localizeClinicalUiLabel("patient note typed by a clinician", "en-CA")).toBeNull();
        expect(localizeClinicalUiLabel(UI_LABELS_FR.clinicalNoteHistory.title, "en-CA")).toBe("Versioned clinical history");
    });
});
