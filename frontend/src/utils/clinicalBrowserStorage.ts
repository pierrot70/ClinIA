const LEGACY_CLINICAL_LOCAL_STORAGE_KEYS = [
  "clinia_last_clinical_payload",
  "clinia_patient_history",
];

const LEGACY_CLINICAL_SESSION_STORAGE_KEYS = [
  "clinia_results_payload",
];

/** Removes clinical payloads written by older frontend versions. */
export function clearLegacyClinicalBrowserStorage() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    for (const key of LEGACY_CLINICAL_LOCAL_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
    }

    for (const key of LEGACY_CLINICAL_SESSION_STORAGE_KEYS) {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}
