import { describe, expect, it } from "vitest";
import { PAGE_UI_SOURCES_FR, PAGE_UI_TRANSLATIONS, localizePageUiLabel, translateUiLabelTree } from "./pageUiLabels";

describe("local page UI translations", () => {
    it.each(["en", "es", "ko", "vi", "no", "ja", "zh", "he"])("covers every approved page source in %s", locale => {
        const dictionary = PAGE_UI_TRANSLATIONS[locale];
        expect(Object.keys(dictionary).sort()).toEqual(Object.keys(PAGE_UI_SOURCES_FR).sort());
        for (const [key, source] of Object.entries(PAGE_UI_SOURCES_FR)) {
            const translated = dictionary[key as keyof typeof PAGE_UI_SOURCES_FR];
            expect(translated.trim().length).toBeGreaterThan(0);
            expect(localizePageUiLabel(source, locale)).toBe(translated);
            expect([...translated.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort())
                .toEqual([...source.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort());
        }
    });
    it("keeps the source French and handles regional locale codes", () => {
        expect(localizePageUiLabel(PAGE_UI_SOURCES_FR.motDePasse, "fr-CA")).toBe("Mot de passe");
        expect(localizePageUiLabel(PAGE_UI_SOURCES_FR.motDePasse, "en-CA")).toBe("Password");
    });
    it("changes static messages while preserving interpolated names and passwords", () => {
        expect(localizePageUiLabel("Sauvegarde reussie pour Synthétique-用户.", "es"))
            .toBe("Guardado correctamente para Synthétique-用户.");
        expect(localizePageUiLabel("Mot de passe temporaire genere: $Secret[+]{1}. ", "en"))
            .toBe("Generated temporary password: $Secret[+]{1}. ");
        expect(localizePageUiLabel("Utilisateur Test_User cree avec succes.", "ja"))
            .toBe("ユーザーTest_Userを作成しました。");
    });
    it("never translates arbitrary clinical or patient text", () => {
        expect(localizePageUiLabel("Clinical narrative from the patient", "en")).toBeNull();
        expect(localizePageUiLabel("Synthétique-用户", "es")).toBeNull();
        expect(localizePageUiLabel(PAGE_UI_SOURCES_FR.motDePasse, "de")).toBeNull();
    });
    it("can localize a versioned label tree without mutating it", () => {
        const source = { section: { title: PAGE_UI_SOURCES_FR.motDePasse }, list: [PAGE_UI_SOURCES_FR.annuler], count: 2 };
        const result = translateUiLabelTree(source, text => localizePageUiLabel(text, "en") ?? text);
        expect(result).toEqual({ section: { title: "Password" }, list: ["Cancel"], count: 2 });
        expect(source.section.title).toBe("Mot de passe");
    });
});
