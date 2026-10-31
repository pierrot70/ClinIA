import { describe, expect, it } from "vitest";
import { receptionAttendanceLabels, receptionAttendanceTranslations } from "./receptionAttendanceLabels";
import { UI_LABELS_FR } from "./uiLabels.fr";

describe("static administrative attendance labels", () => {
    it.each(["fr-CA", "en-CA", "es", "ko-KR", "vi", "no-NO", "ja", "zh", "he"])("provides all labels and date placeholders locally in %s", locale => {
        const labels = receptionAttendanceLabels(locale);
        expect(Object.keys(labels).sort()).toEqual(Object.keys(UI_LABELS_FR.receptionAttendance).sort());
        Object.values(labels).forEach(value => expect(value.trim().length).toBeGreaterThan(1));
        expect(labels.appointment).toContain("{date}"); expect(labels.appointment).toContain("{time}");
        if (locale === "fr-CA") expect(labels).toBe(UI_LABELS_FR.receptionAttendance);
        else expect(labels.title).not.toBe(UI_LABELS_FR.receptionAttendance.title);
    });
    it("uses only a local English fallback for an unknown locale", () => {
        expect(receptionAttendanceLabels("unknown")).toBe(receptionAttendanceTranslations.en);
    });
});
