import { describe, expect, it } from "vitest";
import { getExampleUiLabels, localizeExampleUiLabel } from "./exampleUiLabels";
import { HOME_STRINGS_EN, HOME_STRINGS_FR, HOME_STRINGS_NO, hasValidHomeStringsShape } from "./homeStrings";
import { UI_LOCALES, validUiTranslation } from "./uiLocales";

describe("interface surrounding English clinical examples", () => {
  it.each(UI_LOCALES)("covers titles, labels and notices in %s", locale => {
    const french = getExampleUiLabels("fr-CA");
    const target = getExampleUiLabels(locale);
    for (const [key, source] of Object.entries(french)) {
      const translated = localizeExampleUiLabel(source, locale);
      expect(translated).toBe(target[key as keyof typeof target]);
      expect(validUiTranslation(source, translated)).toBe(true);
    }
  });
  it("provides complete Norwegian home strings without English object fallback", () => {
    expect(hasValidHomeStringsShape(HOME_STRINGS_NO)).toBe(true);
    expect(Object.keys(HOME_STRINGS_NO.home)).toEqual(Object.keys(HOME_STRINGS_FR.home));
    expect(Object.keys(HOME_STRINGS_NO.search)).toEqual(Object.keys(HOME_STRINGS_FR.search));
    expect(HOME_STRINGS_NO.demo).not.toBe(HOME_STRINGS_EN.demo);
    expect(HOME_STRINGS_NO.search.attestationText).toContain("RAMQ");
    expect(HOME_STRINGS_NO.home.title).toBe("Spar tid etter hver diagnose.");
    expect(HOME_STRINGS_NO.demo.steps).toHaveLength(HOME_STRINGS_FR.demo.steps.length);
    for (const key of Object.keys(HOME_STRINGS_FR.options) as (keyof typeof HOME_STRINGS_FR.options)[]) {
      expect(HOME_STRINGS_NO.options[key]).toHaveLength(HOME_STRINGS_FR.options[key].length);
    }
  });
});
