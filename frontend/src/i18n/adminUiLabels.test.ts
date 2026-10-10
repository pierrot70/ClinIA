import { describe, expect, it } from "vitest";
import { adminUiRows, localizeAdminUiLabel } from "./adminUiLabels";
import { UI_LABELS_FR } from "./uiLabels.fr";
import { UI_LOCALES, validUiTranslation } from "./uiLocales";

function leaves(group: unknown): string[] {
    if (typeof group === "string") return [group];
    if (group && typeof group === "object") return Object.values(group).flatMap(leaves);
    return [];
}

describe("administration translation catalogue", () => {
    it("covers database status, user management, session and sensitive-action labels in every selectable locale", () => {
        const sources = [
            ...leaves(UI_LABELS_FR.dbStatus),
            ...leaves(UI_LABELS_FR.auth.userManagement),
            ...leaves(UI_LABELS_FR.auth.session),
            ...leaves(UI_LABELS_FR.auth.sensitiveAction),
        ];
        for (const source of sources) {
            for (const locale of UI_LOCALES) {
                const translation = localizeAdminUiLabel(source, locale);
                expect(translation, `${locale}: ${source}`).not.toBeNull();
                expect(validUiTranslation(source, translation), `${locale}: ${source}`).toBe(true);
            }
        }
    });

    it("provides all nine columns and consistent translations for identical source text", () => {
        const seen = new Map<string, readonly string[]>();
        for (const row of adminUiRows) {
            expect(row).toHaveLength(9);
            if (seen.has(row[0])) expect(row).toEqual(seen.get(row[0]));
            seen.set(row[0], row);
        }
    });

    it("normalizes locale variants and does not translate unknown input", () => {
        expect(localizeAdminUiLabel(UI_LABELS_FR.dbStatus.replica.title, "en-CA")).toBe("Replica summary");
        expect(localizeAdminUiLabel(UI_LABELS_FR.dbStatus.replica.title, "nb-NO")).toBe("Replikaoversikt");
        expect(localizeAdminUiLabel("not-an-interface-label", "en-CA")).toBeNull();
        expect(localizeAdminUiLabel(UI_LABELS_FR.dbStatus.replica.title, "de")).toBeNull();
    });
});
