import { describe, expect, it } from "vitest";

import { getClinicalDemoScenario } from "./clinicalDemoScenarios";

describe("clinical demo scenarios", () => {
    it("returns the type 2 diabetes scenario for a diabetes payload", () => {
        const scenario = getClinicalDemoScenario({
            diagnosis: "Diabete de type 2",
            symptoms: ["Polydipsie", "Polyurie"],
            medical_history: ["Hypertension arterielle"],
        });

        expect(scenario.treatments[0]?.name).toBe("Metformine");
        expect(scenario.treatments.map((item) => item.name)).toContain(
            "Reevaluation d'une option GLP-1"
        );
        expect(scenario.treatments.map((item) => item.name)).not.toContain("Amlodipine");
        expect(scenario.relevanceByAgeChart?.ageBuckets).toEqual([
            "<40",
            "40-49",
            "50-59",
            "60-69",
            "70+",
        ]);
        expect(
            scenario.relevanceByAgeChart?.series.find(
                (item) => item.name === "Metformine"
            )?.values
        ).toEqual([5, 5, 5, 4, 4]);
        expect(scenario.relevanceByAgeChart?.sources).toHaveLength(4);
    });
});
