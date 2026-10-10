import { describe, expect, it } from "vitest";
import { UI_LABELS_FR } from "./uiLabels.fr";
import { localizeResidualUiLabel, residualUiRows } from "./residualUiLabels";
import { UI_LOCALES, validUiTranslation } from "./uiLocales";
describe("residual clinical interface labels", () => {
    it("covers every fixed label and interpolation parameter in every selectable language", () => {
        for (const source of Object.values(UI_LABELS_FR.residualClinicalUi)) for (const locale of UI_LOCALES) {
            expect(validUiTranslation(source, localizeResidualUiLabel(source, locale)), `${locale}: ${source}`).toBe(true);
        }
        for (const row of residualUiRows) expect(row).toHaveLength(9);
    });
    it("does not handle arbitrary clinical content", () => {
        expect(localizeResidualUiLabel("dynamic patient text", "en-CA")).toBeNull();
    });
});
