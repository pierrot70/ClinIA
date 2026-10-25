import { describe, expect, it, vi } from "vitest";
import { withholdUnverifiedDiabetesSummaries } from "../../utils/clinicalSummarySafety.js";
import { resolveCachedDiagnosisState } from "../aiAnalyzeCacheService.js";
import { buildPersistedRealAnalyzeResponse } from "../aiAnalyzeResponseService.js";
import { normalizeClinicalAnalysis, extractPrimaryClinicalConcern, isPlaceholderClinicalAnalysis } from "../../utils/clinicalAnalysis.js";

const input = {
    diagnosis: "Type 2 diabetes",
    symptoms: ["Persistent hyperglycemia"],
    current_medications: ["Metformin"],
    diabetes_context: {
        renal_function: "Preserved or mildly reduced",
        tolerance: "Metformin well tolerated",
        glycemic_goals: "HbA1c < 7% if safe and realistic",
    },
};
const unsafe = {
    diagnosis: { suspected: "Type 2 diabetes" },
    patient_summary: {
        plain_language: "You are currently managing it well with metformin.",
        clinical_language: "Preserved kidney function.",
    },
    clinical_summary: { context: "Good glycemic control.", reference: "unverified" },
    treatments: [{ name: "Metformin", justification: "Authored treatment rationale", monitoring: [] }],
    other_ai_fields: {
        clinical_summary: "Good control.",
        patient_analysis: { patient_summary: "Well managed.", clinicalSummary: "Normal kidneys.", recommendation: "Consider clinical context." },
        sources: [{ title: "Authored reference", url: "https://example.test/reference" }],
    },
    summary_safety: { status: "validated", reason_codes: [] },
};

function replay(output, patient = input) {
    return resolveCachedDiagnosisState({ cachedDiagnosis: { input: patient, output, mode: "real", model: "test-model" },
        model: "test-model", useMock: false, forceRealSafe: false,
        normalizeClinicalAnalysis, extractPrimaryClinicalConcern, isPlaceholderClinicalAnalysis });
}

describe("response-only diabetes summary safety", () => {
    it("withholds unsupported control and renal claims without rewriting or mutating source/input", () => {
        const stored = JSON.stringify(unsafe);
        const submitted = JSON.stringify(input);
        const result = withholdUnverifiedDiabetesSummaries(unsafe, { patient: input });
        expect(result.patient_summary).toEqual({ plain_language: "", clinical_language: "" });
        expect(result.summary_safety).toEqual({ status: "withheld", scope: "generated_summaries", reason_codes: ["GLYCEMIC_CONTROL_NOT_ESTABLISHED", "RENAL_FUNCTION_UNCERTAIN"] });
        expect(result.clinical_summary).toBeUndefined();
        expect(result.other_ai_fields.patient_analysis).toEqual({ recommendation: "Consider clinical context." });
        expect(result.other_ai_fields.sources).toEqual(unsafe.other_ai_fields.sources);
        expect(result.treatments).toEqual(unsafe.treatments);
        expect(JSON.stringify(result)).not.toContain("Good control.");
        expect(JSON.stringify(unsafe)).toBe(stored);
        expect(JSON.stringify(input)).toBe(submitted);
    });

    it.each([
        "Control cannot be determined from the supplied information.",
        "The diabetes is not well controlled.",
        "Follow-up is important.",
    ])("explicitly withholds even generic or cautious summaries, rather than pretending semantic validation: %s", text => {
        const result = withholdUnverifiedDiabetesSummaries({ patient_summary: text }, { patient: input });
        expect(result.summary_safety.status).toBe("withheld");
        expect(result.patient_summary.plain_language).toBe("");
    });

    it("does not count a target or a tolerability statement as a measured observation", () => {
        const patient = { ...input, diabetes_context: { tolerance: "Metformin well tolerated", glycemic_goals: "HbA1c < 7%" } };
        const result = withholdUnverifiedDiabetesSummaries(unsafe, { patient });
        expect(result.summary_safety.reason_codes).toEqual(["GLYCEMIC_CONTROL_NOT_ESTABLISHED", "RENAL_FUNCTION_NOT_ESTABLISHED"]);
    });

    it("is idempotent and leaves other concerns and explicitly simulated content intact", () => {
        const first = withholdUnverifiedDiabetesSummaries(unsafe, { patient: input });
        expect(withholdUnverifiedDiabetesSummaries(first, { patient: input })).toEqual(first);
        expect(withholdUnverifiedDiabetesSummaries(unsafe, { patient: input, source: "mock" })).toBe(unsafe);
        expect(withholdUnverifiedDiabetesSummaries(unsafe, { patient: { diagnosis: "Hypertension" } })).toBe(unsafe);
    });

    it("replays old cache safely without marking response-only removal for a database upgrade", () => {
        const stored = JSON.stringify(unsafe);
        const result = replay(unsafe);
        expect(result.canReuseCachedDiagnosis).toBe(true);
        expect(result.cacheNeedsUpgrade).toBe(false);
        expect(result.normalizedCachedOutput.summary_safety.status).toBe("withheld");
        expect(result.normalizedCachedOutput.patient_summary.plain_language).toBe("");
        expect(JSON.stringify(unsafe)).toBe(stored);
    });

    it("also recognizes a diabetes concern extracted from a legacy symptom-only input", () => {
        const result = replay(unsafe, { symptoms: ["Main symptom: Type 2 diabetes"] });
        expect(result.normalizedCachedOutput.summary_safety.status).toBe("withheld");
        expect(result.cacheNeedsUpgrade).toBe(false);
    });

    it("does not let response safety metadata change placeholder reuse policy", () => {
        const placeholderClassifier = vi.fn(output => !output.summary_safety);
        const result = resolveCachedDiagnosisState({
            cachedDiagnosis: { input, output: {}, mode: "real" }, useMock: false,
            normalizeClinicalAnalysis: value => value,
            extractPrimaryClinicalConcern, isPlaceholderClinicalAnalysis: placeholderClassifier,
        });
        expect(placeholderClassifier).toHaveBeenCalledWith({});
        expect(result.cachedDiagnosisIsPlaceholderReal).toBe(true);
        expect(result.canReuseCachedDiagnosis).toBe(false);
    });

    it.each([
        { persist: false, patient: input }, { persist: true, patient: input },
        { persist: false, patient: { symptoms: ["Main symptom: Type 2 diabetes"] } },
        { persist: true, patient: { symptoms: ["Main symptom: Type 2 diabetes"] } },
    ])("guards actual real response output for $patient with persist=$persist and preserves raw persisted content", async ({ persist, patient }) => {
        const stored = JSON.stringify(unsafe);
        const normalized = { ...unsafe, patient_summary: { plain_language: "Different newly generated summary." } };
        const persistOrReuseDiagnosis = vi.fn(async () => ({ ok: true, doc: { output: unsafe } }));
        const result = await buildPersistedRealAnalyzeResponse({
            fingerprint: "synthetic-summary", patient, normalized, model: "test-model", forceRealSafe: false,
            persistOrReuseDiagnosis, persist, logger: { log: vi.fn() },
        });
        expect(result.responsePayload.data.summary_safety.status).toBe("withheld");
        expect(result.responsePayload.data.patient_summary.plain_language).toBe("");
        expect(result.responsePayload.meta.source).toBe("real");
        expect(JSON.stringify(unsafe)).toBe(stored);
        if (persist) expect(persistOrReuseDiagnosis).toHaveBeenCalledWith(expect.objectContaining({ output: normalized, input: patient }));
        else expect(persistOrReuseDiagnosis).not.toHaveBeenCalled();
    });
});
