import { describe, expect, it } from "vitest";
import { getSimulatedClinicalContent } from "./simulatedClinicalContent";
import { UI_LOCALES } from "./uiLocales";

describe("simulation source policy", () => {
  it.each([...UI_LOCALES, "de"])("does not translate source content in %s", locale => {
    for (const source of ["First-line agent with monitoring.", "Unknown clinical API answer", "Note originale en français."]) {
      expect(getSimulatedClinicalContent(source, locale)).toBe(source);
    }
  });
});
