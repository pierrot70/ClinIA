import { describe, expect, it } from "vitest";
import { UI_LABELS_FR } from "./uiLabels.fr";
import { UI_LOCALES } from "./uiLocales";
import { EXAMPLE_CASES } from "../data/clinicalExampleCases";
import { localizeClinicalFormFieldLabel, clinicalFormFieldRows, exampleConceptSource } from "./clinicalFormFieldLabels";
import { getLocalUiTranslation } from "./localUiTranslations";

describe("clinical form local translations", () => {
    it.each(UI_LOCALES)("covers field labels, help and example concepts in %s", locale => {
        for (const source of Object.values(UI_LABELS_FR.clinicalFormFields)) {
            expect(getLocalUiTranslation(source, locale)?.trim().length).toBeGreaterThan(0);
        }
        for (const example of Object.values(EXAMPLE_CASES)) {
            for (const term of [example.diagnosis, ...example.symptoms, ...example.medical_history]) {
                const source = exampleConceptSource(term!);
                expect(source, term).toBeTruthy();
                expect(localizeClinicalFormFieldLabel(source!, locale)?.trim().length, term).toBeGreaterThan(0);
            }
        }
        for (const row of clinicalFormFieldRows) expect(row).toHaveLength(UI_LOCALES.length);
    });
    it("does not translate arbitrary patient text", () => {
        expect(exampleConceptSource("Patient narrative")).toBeNull();
        expect(localizeClinicalFormFieldLabel("Patient narrative", "he")).toBeNull();
    });
});
