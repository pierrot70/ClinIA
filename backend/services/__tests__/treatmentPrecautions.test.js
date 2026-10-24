import { describe, expect, it } from "vitest";
import { normalizeClinicalAnalysis, extractPrimaryClinicalConcern, isPlaceholderClinicalAnalysis } from "../../utils/clinicalAnalysis.js";
import { resolveCachedDiagnosisState } from "../aiAnalyzeCacheService.js";

const source = () => ({
    therapeutic_options: {
        lifestyle_modifications: ["Synthetic lifestyle option"],
        pharmacologic_treatment: [
            { first_line_agents: ["Synthetic option A"], selection_considerations: "Authored rationale A" },
            { first_line_agents: ["Synthetic option B"], selection_considerations: "Authored rationale B" },
        ],
    },
    contraindications: { class_a: ["Class A restriction", "Second class A restriction"], class_b: ["Class B restriction"] },
    monitoring_considerations: { overall: "Analysis-wide monitoring" },
});

// Exact pre-fix persisted shape, independent of the current normalizer.
function legacyCache() {
    const raw = source();
    return {
        diagnosis: { suspected: "Synthetic concern", certainty_level: "moderate", justification: "Synthetic rationale" },
        treatments: [
            { name: "Synthetic lifestyle option", indication: "Lifestyle modification" },
            { name: "Synthetic option A", indication: "Authored rationale A" },
            { name: "Synthetic option B", indication: "Authored rationale B" },
        ].map(t => ({ ...t, dosage: "", duration: "", contraindications: ["Class A restriction,Second class A restriction", "Class B restriction"], monitoring: ["Analysis-wide monitoring"], evidence_level: "C" })),
        other_ai_fields: raw,
    };
}
function replay(output) {
    return resolveCachedDiagnosisState({
        cachedDiagnosis: { input: { diagnosis: "Synthetic concern" }, output, model: "synthetic", mode: "real" },
        model: "synthetic", useMock: false, forceRealSafe: false,
        normalizeClinicalAnalysis, extractPrimaryClinicalConcern, isPlaceholderClinicalAnalysis,
    });
}

describe("treatment-scoped precautions", () => {
    it("keeps global class precautions in their source context, never on lifestyle or drug options", () => {
        const raw = source();
        const before = structuredClone(raw);
        const output = normalizeClinicalAnalysis(raw);
        expect(output.treatments).toHaveLength(3);
        for (const t of output.treatments) {
            expect(t.contraindications).toEqual([]);
            expect(t.monitoring).toEqual([]);
        }
        expect(output.other_ai_fields).toEqual(before);
        expect(raw).toEqual(before);
    });

    it("preserves only precautions explicitly authored on each pharmacologic option", () => {
        const raw = source();
        raw.therapeutic_options.pharmacologic_treatment[0].contraindications = ["A only — original text"];
        raw.therapeutic_options.pharmacologic_treatment[0].monitoring = ["A monitoring"];
        raw.therapeutic_options.pharmacologic_treatment[1].contraindications = ["B only"];
        const output = normalizeClinicalAnalysis(raw);
        expect(output.treatments[0].contraindications).toEqual([]);
        expect(output.treatments[1]).toMatchObject({ contraindications: ["A only — original text"], monitoring: ["A monitoring"] });
        expect(output.treatments[2]).toMatchObject({ contraindications: ["B only"], monitoring: [] });
    });

    it("preserves authored explicit treatments, even when therapeutic source options also exist", () => {
        const raw = { ...source(), treatments: [{ name: "Authored option", justification: "Original rationale", contraindications: ["Own restriction"], monitoring: ["Own monitoring"] }] };
        const output = normalizeClinicalAnalysis(raw);
        expect(output.treatments).toHaveLength(1);
        expect(output.treatments[0]).toMatchObject(raw.treatments[0]);
    });

    it("sanitizes exact legacy cache replay without mutating or scheduling an upgrade of stored history", () => {
        const raw = legacyCache();
        const before = structuredClone(raw);
        const result = replay(raw);
        expect(result.canReuseCachedDiagnosis).toBe(true);
        expect(result.cacheNeedsUpgrade).toBe(false);
        expect(result.normalizedCachedOutput.treatments).toHaveLength(3);
        for (const t of result.normalizedCachedOutput.treatments) {
            expect(t.contraindications).toEqual([]);
            expect(t.monitoring).toEqual([]);
        }
        expect(result.normalizedCachedOutput.other_ai_fields).toMatchObject(before.other_ai_fields);
        expect(raw).toEqual(before);
        expect(normalizeClinicalAnalysis(result.normalizedCachedOutput, { repairLegacyDerivedTreatments: true }).treatments.every(t => !t.contraindications.length && !t.monitoring.length)).toBe(true);
    });

    it("repairs source-scoped fields rather than inventing a class-to-name match", () => {
        const raw = legacyCache();
        raw.other_ai_fields.therapeutic_options.pharmacologic_treatment[0].contraindications = ["Authored A restriction"];
        expect(replay(raw).normalizedCachedOutput.treatments[1].contraindications).toEqual(["Authored A restriction"]);
    });

    it("does not repair explicit treatments on the live normalization path", () => {
        const raw = legacyCache();
        const output = normalizeClinicalAnalysis(raw);
        expect(output.treatments.map(t => t.contraindications)).toEqual(raw.treatments.map(t => t.contraindications));
    });

    it("also recognizes legacy cache entries normalized again with an empty justification", () => {
        const raw = normalizeClinicalAnalysis(legacyCache());
        expect(raw.treatments.every(t => t.justification === "")).toBe(true);
        const result = replay(raw);
        expect(result.normalizedCachedOutput.treatments.every(t => !t.contraindications.length && !t.monitoring.length)).toBe(true);
        expect(result.cacheNeedsUpgrade).toBe(false);
    });

    it.each([
        ["authored rationale", raw => { raw.treatments[1].justification = "Dedicated authored rationale"; }],
        ["dedicated restriction", raw => { raw.treatments[1].contraindications = ["Dedicated restriction"]; }],
        ["dedicated monitoring", raw => { raw.treatments[1].monitoring = ["Dedicated monitoring"]; }],
        ["dosage", raw => { raw.treatments[1].dosage = "Authored dose"; }],
        ["order", raw => { raw.treatments.reverse(); }],
        ["extra metadata", raw => { raw.treatments[1].authored = true; }],
        ["missing source", raw => { delete raw.other_ai_fields.therapeutic_options; }],
    ])("does not guess legacy provenance when there is a difference: %s", (_, alter) => {
        const raw = legacyCache();
        alter(raw);
        const before = structuredClone(raw);
        const output = replay(raw).normalizedCachedOutput;
        expect(output.treatments.map(t => t.contraindications)).toEqual(raw.treatments.map(t => t.contraindications));
        expect(output.treatments.map(t => t.monitoring)).toEqual(raw.treatments.map(t => t.monitoring));
        expect(raw).toEqual(before);
    });
});
