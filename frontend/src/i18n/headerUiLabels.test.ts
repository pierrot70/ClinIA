import { describe, expect, it } from "vitest";
import { UI_LABELS_FR } from "./uiLabels.fr";
import { UI_LOCALES, validUiTranslation } from "./uiLocales";
import { getLocalUiTranslation } from "./localUiTranslations";
import { localizeHeaderUiLabel } from "./headerUiLabels";

function leaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return value && typeof value === "object" ? Object.values(value).flatMap(leaves) : [];
}
describe("header translation catalog", () => {
  it.each(UI_LOCALES)("covers every header label in %s without another-language fallback", locale => {
    for (const source of leaves(UI_LABELS_FR.header)) {
      const translated = localizeHeaderUiLabel(source, locale);
      expect(translated, `${locale}: ${source}`).not.toBeNull();
      expect(validUiTranslation(source, translated), `${locale}: ${source}`).toBe(true);
    }
  });
  it.each(UI_LOCALES)("uses reviewed database navigation and localized AI mode badges in %s", locale => {
    const { nav, aiMode } = UI_LABELS_FR.header;
    for (const source of [nav.dbAudits, nav.dbStatus, aiMode.mock, aiMode.real]) {
      const translation = localizeHeaderUiLabel(source, locale)!;
      expect(getLocalUiTranslation(source, locale)).toBe(translation);
      if (locale !== "fr-CA") expect(translation).not.toMatch(/\bBD\b/);
    }
    expect(getLocalUiTranslation(aiMode.mock, locale)).not.toBe("AI mock");
  });
  it("uses natural English database navigation and accented French sources", () => {
    expect(getLocalUiTranslation(UI_LABELS_FR.header.nav.dbAudits, "en-CA")).toBe("Database audits");
    expect(getLocalUiTranslation(UI_LABELS_FR.header.nav.dbStatus, "en-CA")).toBe("Database status");
    expect(UI_LABELS_FR.header.nav.dbStatus).toBe("État BD");
    expect(UI_LABELS_FR.pageUi.gererLesUtilisateurs).toBe("Gérer les utilisateurs");
    expect(getLocalUiTranslation(UI_LABELS_FR.pageUi.gererLesUtilisateurs, "en-CA")).toBe("Manage users");
  });

  it("does not invent translations for unsupported locales or unknown sources", () => {
    expect(localizeHeaderUiLabel("No such header label", "en-CA")).toBeNull();
    expect(localizeHeaderUiLabel(UI_LABELS_FR.header.nav.home, "de")).toBeNull();
  });
});
