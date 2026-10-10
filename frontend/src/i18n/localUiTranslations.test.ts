import { describe, expect, it } from "vitest";
import { UI_LABELS_FR } from "./uiLabels.fr";
import { getLocalUiTranslation, getLocalUiMessage } from "./localUiTranslations";
import { UI_LOCALES, validUiTranslation } from "./uiLocales";

function leaves(value: unknown, path = ""): { key: string; source: string }[] {
    if (typeof value === "string") return [{ key: path, source: value }];
    if (!value || typeof value !== "object") return [];
    return Object.entries(value).flatMap(([key, child]) => leaves(child, `${path}.${key}`));
}

describe("local UI translation coverage", () => {
    it.each(UI_LOCALES.flatMap(locale => leaves(UI_LABELS_FR.loginPage).map(row => ({ locale, ...row }))))(
        "resolves login$key in $locale without any server or browser cache",
        ({ locale, source }) => {
            const translated = getLocalUiTranslation(source, locale);
            expect(validUiTranslation(source, translated)).toBe(true);
            if (locale !== "fr-CA") expect(translated).not.toBe(source);
        },
    );
    it("does not translate unregistered patient or generated clinical text", () => {
        expect(getLocalUiTranslation("Texte patient synthétique non enregistré — identifiant 9876", "en-CA")).toBeNull();
        expect(getLocalUiTranslation("Texte clinique synthétique sur un sujet non enregistré", "en-CA")).toBeNull();
        expect(getLocalUiMessage("Erreur inconnue sur un serveur synthétique", "en-CA")).toBeNull();
    });
    it("validates each occurrence of named placeholders", () => {
        expect(validUiTranslation("{count} sur {limit}", "{count} of {limit}")).toBe(true);
        expect(validUiTranslation("{count} sur {limit}", "{count} remaining")).toBe(false);
        expect(validUiTranslation("{count} / {count}", "{count}")).toBe(false);
    });
    it.each(UI_LOCALES)("localizes known server errors in %s without exposing unknown prose", locale => {
        expect(getLocalUiMessage(UI_LABELS_FR.loginPage.errors.invalidCredentials, locale))
            .toBe(getLocalUiTranslation(UI_LABELS_FR.loginPage.errors.invalidCredentials, locale));
        expect(getLocalUiMessage("Unregistered server error with synthetic identifier 9876", locale)).toBeNull();
    });
    it("preserves parameter values while translating a known message template", () => {
        const message = UI_LABELS_FR.emailQuota.remaining.replace("{remaining}", "146");
        expect(getLocalUiMessage(message, "en-CA")).toBe("146 attempts remaining");
    });
});
