import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeClinicalAnalysis, extractPrimaryClinicalConcern, isPlaceholderClinicalAnalysis } from "../clinicalAnalysis.js";
import { resolveCachedDiagnosisState } from "../../services/aiAnalyzeCacheService.js";

// Exact therapeutic option subtrees from three authorized fictional review
// cases. These fixtures are historical content, not medical recommendations.
const fixtures = JSON.parse(readFileSync(new URL("./fixtures/historicalDiabetesTherapeuticOptions.json", import.meta.url), "utf8"));
const expectedNames = {
    "DT2-55": ["GLP-1 receptor agonists", "SGLT2 inhibitors", "Other agents (DPP-4 inhibitors, sulfonylureas, insulin)"],
    "DT2-78-LOW-FRAILTY": ["GLP-1 receptor agonists", "SGLT2 inhibitors", "Other agents"],
    "DT2-CV-58": ["GLP-1 receptor agonists", "SGLT2 inhibitors"],
};
function rawCache(fixture) {
    return {
        treatments: [],
        other_ai_fields: {
            therapeutic_options: structuredClone(fixture.therapeutic_options),
            monitoring_considerations: { unrelated: "GLOBAL monitoring must not be copied" },
            contraindications_and_cautions: { unrelated: "GLOBAL caution must not be copied" },
        },
    };
}

describe("historical therapeutic option projection", () => {
    it.each(fixtures)("recovers exact authored labels and fields for $id without mutation", fixture => {
        const raw = rawCache(fixture);
        const before = structuredClone(raw);
        const normalized = normalizeClinicalAnalysis(raw);
        expect(normalized.treatments.map(option => option.name)).toEqual(expectedNames[fixture.id]);
        expect(normalized.other_ai_fields.therapeutic_options).toEqual(fixture.therapeutic_options);
        const keyed = fixture.therapeutic_options.additional_or_alternative_options;
        const options = keyed ? Object.entries(keyed) : (fixture.therapeutic_options.additional_options ?? fixture.therapeutic_options.additional_agents).map(option => [undefined, option]);
        options.forEach(([key, option], index) => {
            const treatment = normalized.treatments[index];
            expect(treatment.source_fields).toEqual(key === undefined ? option : { [key]: option });
            expect(treatment.justification).toBe(option.rationale ?? "");
            expect(treatment.details).toBe(option.description ?? "");
            expect(treatment.indication).toBe("");
            expect(treatment.monitoring).toEqual([]);
            expect(treatment.contraindications).toEqual(option.contraindications ? [option.contraindications] : []);
            expect(treatment.evidence_level).toBe("C");
        });
        expect(raw).toEqual(before);
        expect(normalizeClinicalAnalysis(raw)).toEqual(normalized);
        expect(normalizeClinicalAnalysis(normalized)).toEqual(normalized);
        expect(normalized.treatments.some(option => option.name === "Metformin")).toBe(false);
    });

    it.each(fixtures)("keeps $id cache source unchanged and response-only for diabetes and other input contexts", fixture => {
        for (const diagnosis of ["Type 2 diabetes", "Historical synthetic concern"]) {
            const cachedDiagnosis = { input: { diagnosis }, output: rawCache(fixture), mode: "real", model: "gpt-4.1-mini" };
            const before = structuredClone(cachedDiagnosis);
            const result = resolveCachedDiagnosisState({ cachedDiagnosis, useMock: false, normalizeClinicalAnalysis, extractPrimaryClinicalConcern, isPlaceholderClinicalAnalysis });
            expect(result.canReuseCachedDiagnosis).toBe(true);
            expect(result.cacheNeedsUpgrade).toBe(false);
            expect(result.normalizedCachedOutput.treatments.map(option => option.name)).toEqual(expectedNames[fixture.id]);
            expect(cachedDiagnosis).toEqual(before);
            if (diagnosis === "Type 2 diabetes") expect(result.normalizedCachedOutput.summary_safety.status).toBe("withheld");
        }
    });

    it("preserves an already stored nested source wrapper without recursively interpreting it", () => {
        const raw = rawCache(fixtures[2]);
        const nested = {
            therapeutic_options: { additional_agents: [{ class: "Historical conflicting nested option", rationale: "Nested original" }] },
            comparison_current_vs_glp1: { neutral_conclusion: "Original uncertain comparison" },
        };
        raw.other_ai_fields.other_ai_fields = nested;
        raw.other_ai_fields.comparison_current_vs_glp1 = { neutral_conclusion: "Top-level original comparison" };
        const before = structuredClone(raw);
        const output = normalizeClinicalAnalysis(raw);
        expect(output.treatments.map(option => option.name)).toEqual(expectedNames[fixtures[2].id]);
        expect(output.other_ai_fields.other_ai_fields).toEqual(nested);
        expect(output.other_ai_fields.comparison_current_vs_glp1).toEqual(raw.other_ai_fields.comparison_current_vs_glp1);
        expect(normalizeClinicalAnalysis(output)).toEqual(output);
        expect(raw).toEqual(before);
    });

    it("preserves explicit treatments instead of replacing them with historical derived options", () => {
        const raw = { ...rawCache(fixtures[0]), treatments: [{ name: "Existing authored treatment", justification: "Own rationale", monitoring: ["Own monitoring"], contraindications: ["Own caution"] }] };
        const output = normalizeClinicalAnalysis(raw);
        expect(output.treatments).toHaveLength(1);
        expect(output.treatments[0]).toMatchObject(raw.treatments[0]);
    });

    it("preserves only each option's own strings, structured unknowns and uncertainty", () => {
        const option = { class: "Synthetic option", rationale: "  Authored uncertain rationale  ", description: "Own description", contraindications: "  Own conditional caution  ", monitoring: "  Own check  ", unknown: { qualifier: "uncertain" }, references: [{ name: "Source title" }] };
        const raw = { therapeutic_options: { additional_agents: [option] }, contraindications: { unrelated: "Global restriction" }, monitoring_considerations: { unrelated: "Global monitoring" } };
        const result = normalizeClinicalAnalysis(raw);
        expect(result.treatments[0]).toMatchObject({ name: option.class, justification: option.rationale, details: option.description, contraindications: [option.contraindications], monitoring: [option.monitoring], source_fields: option });
        expect(normalizeClinicalAnalysis(result)).toEqual(result);
    });

    it("does not infer names from current strategy prose or scan nested references and monitoring", () => {
        const raw = { therapeutic_options: {
            current_strategy: { description: "Continuation of synthetic medication", rationale: "Original rationale" },
            additional_options: [null, "A string", [], { references: [{ name: "A guideline" }], monitoring: [{ name: "A test" }] }, { nested: { class: "A nested option" } }],
            additional_agents: { wrong_shape: { class: "Wrong-shaped option" } },
            additional_or_alternative_options: { references: { name: "A guideline" }, monitoring: { name: "A test" }, current_strategy: { description: "Medication mentioned in prose" } },
            monitoring: [{ name: "Global test" }],
            references: [{ name: "A guideline" }],
            arbitrary: { additional_agents: [{ class: "Nested option" }] },
        } };
        const output = normalizeClinicalAnalysis(raw);
        expect(output.treatments).toEqual([]);
        expect(output.other_ai_fields.therapeutic_options).toEqual(raw.therapeutic_options);
    });

    it("preserves malformed fields in source without stringifying them into clinical display text", () => {
        const option = { class: "Synthetic option", rationale: { qualifier: "uncertain" }, description: ["Authored detail"], contraindications: { note: "Own restriction" }, monitoring: [null, { name: "Object" }, "Own check"] };
        const output = normalizeClinicalAnalysis({ therapeutic_options: { additional_agents: [option] } });
        expect(output.treatments[0]).toMatchObject({ justification: "", details: "", contraindications: [], monitoring: ["Own check"], source_fields: option });
    });
});
