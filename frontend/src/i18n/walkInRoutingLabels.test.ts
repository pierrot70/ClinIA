import { describe, expect, it } from "vitest";
import { UI_LABELS_FR } from "./uiLabels.fr";
import { UI_LOCALES, validUiTranslation } from "./uiLocales";
import { walkInRoutingLabels } from "./walkInRoutingLabels";
import { getLocalUiTranslation } from "./localUiTranslations";
describe("deterministic WalkIn routing labels", () => {
    it.each(UI_LOCALES)("provides every French-source routing label and placeholders locally in %s", locale => {
        const labels = walkInRoutingLabels(locale);
        for (const [key, source] of Object.entries(UI_LABELS_FR.walkInRouting)) {
            const value = labels[key as keyof typeof labels];
            expect(validUiTranslation(source, value)).toBe(true);
            expect(getLocalUiTranslation(source, locale)).toBe(value);
        }
        expect(getLocalUiTranslation(UI_LABELS_FR.auth.userManagement.roles.IPS, locale)).toContain("IPS");
    });
});
