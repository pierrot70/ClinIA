import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getMockForDiagnosis } from "../clinicalMocks.js";

const mocks = JSON.parse(readFileSync(new URL("../clinicalMocks.json", import.meta.url), "utf8"));

describe("fixed English clinical mock sources", () => {
    it("keeps English content for French and English diagnosis matching", () => {
        expect(getMockForDiagnosis("Diabete de type 2")).toEqual(getMockForDiagnosis("Type 2 diabetes"));
        expect(getMockForDiagnosis("Diabete de type 2").treatments[0].name).toBe("Metformin");
        expect(getMockForDiagnosis("Hypertension").treatments[0].name).toBe("Lifestyle changes");
        expect(getMockForDiagnosis("Heart failure")).toEqual(getMockForDiagnosis("Insuffisance cardiaque"));
        expect(mocks.hypertension.patient_summary).toBe(getMockForDiagnosis("Hypertension").patient_summary);
    });

    it("describes the synthetic diabetes context without declaring a final diagnosis or celebrating disease", () => {
        for (const mock of [mocks.diabete_type_2, getMockForDiagnosis("diabetes")]) {
            expect(mock.patient_summary).toContain("type 2 diabetes");
            expect(mock.patient_summary).not.toMatch(/elevated blood glucose/i);
            expect(mock.treatments.every(treatment => !("efficacy" in treatment))).toBe(true);
            expect(mock.patient_summary).not.toMatch(/Hooray|Hourra|indicating type 2 diabetes/);
        }
    });

    it("retains authored contraindications and cautions and covers metformin continuation once", () => {
        expect(mocks.hypertension.treatments[1]).toMatchObject({name: "Amlodipine", contraindications: ["Severe hypotension"], efficacy: 82});
        expect(mocks.diabete_type_2.treatments.map(treatment => treatment.name)).toEqual([
            "Metformin",
            "Reassessment of a GLP-1 option",
        ]);
        expect(mocks.diabete_type_2.treatments[0].contraindications).toEqual(["Severe renal impairment"]);
        expect(mocks.diabete_type_2.treatments[1].contraindications).toContain("Caution if the clinical context is incomplete");
        expect(mocks.diabete_type_2.treatments[1].justification).toContain("without replacing clinical judgment");
    });
});
