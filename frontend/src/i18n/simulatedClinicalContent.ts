// Simulation sources are authored in English. Locale changes affect UI labels
// only; never transform clinical API content or clinician-entered notes.
export function getSimulatedClinicalContent(text: string, _locale: string): string {
  return text;
}
