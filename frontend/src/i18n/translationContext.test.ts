import { describe, expect, it } from "vitest";
import { UI_LABELS_FR as labels } from "./uiLabels.fr";
import { UI_LOCALES, baseUiLocale } from "./uiLocales";
import { getLocalUiTranslation } from "./localUiTranslations";
import { consultationLabels } from "./consultationLabels";

describe("translation meaning and locale variants", () => {
    it("distinguishes a clinic from the clinical view and a patient's last name", () => {
        for (const [locale, clinic, view, lastName] of [
            ["en-CA", "Clinic", "Clinical view", "Last name"],
            ["es", "Clínica", "Vista clínica", "Apellido"],
        ]) {
            expect(getLocalUiTranslation(labels.appointmentsList.table.clinic, locale)).toBe(clinic);
            expect(getLocalUiTranslation(labels.componentUi.clinique, locale)).toBe(view);
            expect(getLocalUiTranslation("Nom", locale)).toBe(lastName);
        }
    });

    it("uses processing rather than medical treatment for the recovery action", () => {
        expect(getLocalUiTranslation(labels.loginPage.recovery.processing, "es")).toBe("Procesando...");
        expect(getLocalUiTranslation("Traitement", "es")).toBe("Tratamiento");
    });

    it.each(UI_LOCALES)("resolves consultation labels for both base and regional codes in %s", locale => {
        expect(consultationLabels(baseUiLocale(locale))).toEqual(consultationLabels(locale));
        for (const key of ["description", "ownOnly", "noteHelp", "confirm", "accepted"] as const) {
            expect(getLocalUiTranslation(labels.consultations[key], locale)).toBe(consultationLabels(locale)[key]);
        }
    });

    it("supports Norwegian and Hebrew browser aliases", () => {
        expect(consultationLabels("nb-NO")).toEqual(consultationLabels("no-NO"));
        expect(consultationLabels("iw-IL")).toEqual(consultationLabels("he"));
    });

    it.each(UI_LOCALES)("keeps example JSON machine keys and localizes its human placeholder in %s", locale => {
        const source = labels.clinicalDemo.form.jsonImportPlaceholder;
        const translated = getLocalUiTranslation(source, locale)!;
        const example = JSON.parse(translated);
        expect(Object.keys(example)).toEqual(["age", "sex", "diagnosis"]);
        expect(example.age).toBe(55);
        expect(example.sex).toBe("male");
        if (locale !== "fr-CA") expect(example.diagnosis).not.toBe("Diabete de type 2");
        if (locale === "en-CA") expect(example.diagnosis).toBe("Type 2 diabetes");
        expect(getLocalUiTranslation("{count} / {limit}", locale)).toBe("{count} / {limit}");
    });
});
