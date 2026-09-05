import { describe, expect, it } from "vitest";
import { receptionLabel } from "./receptionLabels";
import { UI_LABELS_FR } from "./uiLabels.fr";

describe("receiving physician account message", () => {
    const source = UI_LABELS_FR.walkInArrival.receivingPhysicianUnavailable;
    it.each(["fr-CA", "en-CA", "es", "ko-KR", "vi", "no-NO", "ja", "zh", "he"])("is available locally in %s", locale => {
        const message = receptionLabel(locale, "receivingPhysicianUnavailable", source);
        expect(message).toContain("ClinIA");
        if (locale === "fr-CA") expect(message).toBe(source);
        else expect(message).not.toBe(source);
    });
});
