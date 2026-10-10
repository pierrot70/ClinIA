import { describe, expect, it } from "vitest";
import { UI_LABELS_FR } from "./uiLabels.fr";
import { UI_LOCALES, validUiTranslation } from "./uiLocales";
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
  it("does not invent translations for unsupported locales or unknown sources", () => {
    expect(localizeHeaderUiLabel("No such header label", "en-CA")).toBeNull();
    expect(localizeHeaderUiLabel(UI_LABELS_FR.header.nav.home, "de")).toBeNull();
  });
});
