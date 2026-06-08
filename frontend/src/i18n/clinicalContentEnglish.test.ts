import { describe, expect, it } from "vitest";

import { getImmediateEnglishClinicalContent } from "./clinicalContentEnglish";

describe("clinicalContentEnglish", () => {
  it("provides immediate English questions and answers for simulated scenarios", () => {
    expect(
      getImmediateEnglishClinicalContent("Les antibiotiques sont-ils utiles ?")
    ).toBe("Are antibiotics useful?");
    expect(
      getImmediateEnglishClinicalContent(
        "Donnees simulees : pas dans la mononucleose virale non compliquee, sauf si une autre infection bacterienne est documentee."
      )
    ).toContain("not for uncomplicated viral mononucleosis");
  });
});
