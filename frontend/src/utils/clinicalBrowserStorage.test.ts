import { beforeEach, describe, expect, it } from "vitest";
import { clearLegacyClinicalBrowserStorage } from "./clinicalBrowserStorage";

describe("clearLegacyClinicalBrowserStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("removes only legacy clinical payloads", () => {
    window.localStorage.setItem("clinia_last_clinical_payload", "clinical-data");
    window.localStorage.setItem("clinia_patient_history", "clinical-history");
    window.sessionStorage.setItem("clinia_results_payload", "clinical-results");
    window.localStorage.setItem("clinia_force_real", "true");

    clearLegacyClinicalBrowserStorage();

    expect(window.localStorage.getItem("clinia_last_clinical_payload")).toBeNull();
    expect(window.localStorage.getItem("clinia_patient_history")).toBeNull();
    expect(window.sessionStorage.getItem("clinia_results_payload")).toBeNull();
    expect(window.localStorage.getItem("clinia_force_real")).toBe("true");
  });
});
