import { describe, expect, it } from "vitest";
import { getSimulatedClinicalContent, simulatedClinicalRows } from "./simulatedClinicalContent";
import { UI_LOCALES } from "./uiLocales";

describe("versioned simulation translations", () => {
  it.each(UI_LOCALES)("covers all known simulation answers in %s", locale => {
    for (const row of simulatedClinicalRows) {
      expect(row).toHaveLength(UI_LOCALES.length);
      const translation = getSimulatedClinicalContent(row[0], locale);
      expect(translation?.trim().length).toBeGreaterThan(0);
      if (locale !== "fr-CA") expect(translation).not.toBe(row[0]);
    }
  });
  it("does not substitute arbitrary clinical text or unsupported languages", () => {
    expect(getSimulatedClinicalContent("Unknown clinical API answer", "ko-KR")).toBeNull();
    expect(getSimulatedClinicalContent(simulatedClinicalRows[0][0], "de")).toBeNull();
  });
});
