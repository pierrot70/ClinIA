import { describe, expect, it } from "vitest";
import { MISC_UI_SOURCES_FR, MISC_UI_TRANSLATIONS, localizeMiscUiLabel } from "./miscUiLabels";
import { UI_LABELS_FR } from "./uiLabels.fr";
import { localizeSchedulingUiLabel } from "./schedulingUiLabels";

describe("remaining approved UI sources", () => {
    it.each(["en", "es", "ko", "vi", "no", "ja", "zh", "he"])("covers complete source sentences in %s", language => {
        expect(Object.keys(MISC_UI_TRANSLATIONS[language]).sort()).toEqual(Object.keys(MISC_UI_SOURCES_FR).sort());
        for (const [key, source] of Object.entries(MISC_UI_SOURCES_FR)) {
            const translated = MISC_UI_TRANSLATIONS[language][key as keyof typeof MISC_UI_SOURCES_FR];
            expect(translated.trim().length).toBeGreaterThan(0);
            expect(localizeMiscUiLabel(source, language)).toBe(translated);
            expect(localizeMiscUiLabel(source.slice(0, Math.floor(source.length / 2)), language)).toBeNull();
        }
        expect(localizeMiscUiLabel(MISC_UI_SOURCES_FR.availabilityAlignment, language)).toContain("15");
        expect(localizeMiscUiLabel(MISC_UI_SOURCES_FR.restrictedAccess, language)).toContain("SUPERADMIN");
        expect(localizeMiscUiLabel(MISC_UI_SOURCES_FR.openAiLogsDescription, language)).toContain("URL");
        expect(localizeMiscUiLabel(MISC_UI_SOURCES_FR.openAiLogsDescription, language)).toContain("CSV");
        expect(localizeSchedulingUiLabel(UI_LABELS_FR.cliniquesPage.filters.nameLabel, language))
            .toBe(localizeSchedulingUiLabel(UI_LABELS_FR.cliniquesPage.form.nameLabel, language));
    });
    it("retains complete security and schedule meaning in English", () => {
        expect(localizeMiscUiLabel(MISC_UI_SOURCES_FR.restrictedAccess, "en-CA"))
            .toBe("Access temporarily restricted: ClinIA blocked this sensitive area after unusual activity was detected on this account. Try again later or contact a SUPERADMIN.");
        expect(localizeMiscUiLabel(MISC_UI_SOURCES_FR.availabilityAlignment, "en-CA"))
            .toBe("Availability times must align with 15-minute intervals.");
        expect(localizeMiscUiLabel(MISC_UI_SOURCES_FR.unusualActivity, "en-CA"))
            .toBe("Unusual activity has been detected on this account.");
        expect(localizeSchedulingUiLabel(UI_LABELS_FR.cliniquesPage.filters.nameLabel, "en-CA")).toBe("Clinic name");
    });
    it("keeps French sources and does not match arbitrary clinical narratives", () => {
        expect(localizeMiscUiLabel(MISC_UI_SOURCES_FR.restrictedAccess, "fr-CA")).toBe(MISC_UI_SOURCES_FR.restrictedAccess);
        expect(localizeMiscUiLabel("Synthetic patient narrative", "en")).toBeNull();
        expect(localizeMiscUiLabel(MISC_UI_SOURCES_FR.unusualActivity, "de")).toBeNull();
    });
});
