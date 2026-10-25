import { extractPrimaryClinicalConcern } from "./clinicalAnalysis.js";

// Response-only guard. The approved diabetes input contract contains goals and
// tolerability, but no verified observation establishing glycemic control.
// Do not infer control from either, or semantically rewrite generated prose.
// Conservative tradeoff: even a safe/generic generated summary is withheld.
// Stored historical output remains the source of record, unchanged.
const SUMMARY_KEYS = new Set([
    "patient_summary", "clinical_summary", "patientSummary", "clinicalSummary",
]);

function omitGeneratedSummaries(value) {
    if (Array.isArray(value)) return value.map(omitGeneratedSummaries);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value)
        .filter(([key]) => !SUMMARY_KEYS.has(key) && key !== "summary_safety")
        .map(([key, child]) => [key, omitGeneratedSummaries(child)]));
}

export function withholdUnverifiedDiabetesSummaries(analysis, { patient = {}, source = "real" } = {}) {
    if (!analysis || typeof analysis !== "object" || source !== "real") return analysis;
    const diagnosis = extractPrimaryClinicalConcern(patient).toLowerCase();
    const isDiabetes = diagnosis.includes("diab") || Boolean(patient?.diabetes_context);
    if (!isDiabetes) return analysis;

    const reasonCodes = ["GLYCEMIC_CONTROL_NOT_ESTABLISHED"];
    const renal = patient?.diabetes_context?.renal_function;
    if (typeof renal !== "string" || !renal.trim()) {
        reasonCodes.push("RENAL_FUNCTION_NOT_ESTABLISHED");
    } else if (/\bor\b|\bou\b|\bpossible\b|\bunknown\b|\buncertain\b/i.test(renal)) {
        reasonCodes.push("RENAL_FUNCTION_UNCERTAIN");
    }

    return {
        ...omitGeneratedSummaries(analysis),
        patient_summary: { plain_language: "", clinical_language: "" },
        summary_safety: {
            status: "withheld",
            reason_codes: reasonCodes,
            scope: "generated_summaries",
        },
    };
}
