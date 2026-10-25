import { describe, expect, it } from "vitest";

import { getClinicalDemoScenario } from "./clinicalDemoScenarios";

describe("clinical demo scenarios", () => {
    it("matches the English depression example instead of the hypertension fallback", () => {
        expect(getClinicalDemoScenario({ diagnosis: "Major depressive disorder" }))
            .toEqual(getClinicalDemoScenario({ diagnosis: "Trouble depressif majeur" }));
        expect(getClinicalDemoScenario({ diagnosis: "Major depressive disorder" }))
            .not.toEqual(getClinicalDemoScenario({ diagnosis: "Hypertension" }));
    });
    it("returns the type 2 diabetes scenario for a diabetes payload", () => {
        const scenario = getClinicalDemoScenario({
            diagnosis: "Diabete de type 2",
            age: 55,
            symptoms: ["Polydipsie", "Polyurie"],
            medical_history: ["Hypertension arterielle"],
            diabetes_context: {
                cardiovascular_risk: "Modere a eleve",
                renal_function: "Preservee ou legerement reduite",
                fragility: "Faible",
                tolerance: "Bonne tolerance a la metformine",
                glycemic_goals: "HbA1c < 7 % si securitaire et realiste",
            },
        });

        expect(scenario.treatments[0]?.name).toBe("Metformin");
        expect(scenario.treatments.map((item) => item.name)).toContain(
            "Reassessment of a GLP-1 option"
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
                (item) => item.name === "Metformin"
            )?.values
        ).toEqual([5, 5, 5, 4, 4]);
        expect(scenario.relevanceByAgeChart?.sources).toHaveLength(4);
    });

    it("returns a more conservative age chart for an older frail type 2 diabetes profile", () => {
        const stableScenario = getClinicalDemoScenario({
            diagnosis: "Diabete de type 2",
            age: 55,
            symptoms: ["Polydipsie", "Polyurie"],
            medical_history: ["Hypertension arterielle"],
            diabetes_context: {
                cardiovascular_risk: "Modere a eleve",
                renal_function: "Preservee ou legerement reduite",
                fragility: "Faible",
                tolerance: "Bonne tolerance a la metformine",
                glycemic_goals: "HbA1c < 7 % si securitaire et realiste",
            },
        });

        const frailScenario = getClinicalDemoScenario({
            diagnosis: "Diabete de type 2",
            age: 79,
            symptoms: ["Fatigue", "Perte de poids", "Hyperglycemie persistante"],
            medical_history: [
                "Insuffisance renale chronique",
                "Maladie cardiovasculaire",
                "Chutes recentes",
            ],
            diabetes_context: {
                cardiovascular_risk: "Tres eleve",
                renal_function: "Reduction moderee a importante",
                fragility: "Elevee",
                tolerance: "Tolerance digestive limitee",
                glycemic_goals:
                    "Objectif plus souple en raison de la fragilite et du risque d'effets indesirables",
            },
        });

        expect(frailScenario.relevanceByAgeChart?.subtitle).toContain(
            "profile with explicitly reported frailty"
        );
        expect(
            stableScenario.relevanceByAgeChart?.series.find(
                (item) => item.name === "Cautious continuation of the current strategy"
            )?.values
        ).toEqual([2, 2, 3, 4, 4]);
        expect(
            frailScenario.relevanceByAgeChart?.series.find(
                (item) => item.name === "Cautious continuation of the current strategy"
            )?.values
        ).toEqual([2, 2, 3, 4, 5]);
        expect(
            frailScenario.relevanceByAgeChart?.series.find(
                (item) => item.name === "Metformin"
            )?.values
        ).toEqual([5, 5, 4, 3, 2]);
    });

    it("returns a cardiorenal-high-risk chart when the diabetes profile is high risk without frailty", () => {
        const scenario = getClinicalDemoScenario({
            diagnosis: "Diabete de type 2",
            age: 62,
            symptoms: ["Hyperglycemie persistante"],
            medical_history: ["Maladie cardiovasculaire"],
            diabetes_context: {
                cardiovascular_risk: "Tres eleve",
                renal_function: "Reduction moderee a importante",
                fragility: "Faible",
                tolerance: "Bonne tolerance a la metformine",
                glycemic_goals: "HbA1c individualisee selon le contexte cardio-renal",
            },
        });

        expect(scenario.relevanceByAgeChart?.subtitle).toContain(
            "high-risk cardiorenal profile"
        );
        expect(
            scenario.relevanceByAgeChart?.series.find(
                (item) => item.name === "SGLT2 inhibitor"
            )?.values
        ).toEqual([3, 4, 5, 5, 5]);
        expect(
            scenario.relevanceByAgeChart?.series.find(
                (item) => item.name === "Cautious continuation of the current strategy"
            )?.values
        ).toEqual([1, 2, 2, 3, 3]);
    });
    it("preserves matching and chart values for equivalent English and French contexts", () => {
        const french = getClinicalDemoScenario({ diagnosis: "Diabete de type 2", age: 62,
            diabetes_context: { cardiovascular_risk: "Tres eleve", renal_function: "Reduction moderee a importante", fragility: "Faible", tolerance: "Bonne tolerance", glycemic_goals: "Individualises" } });
        const english = getClinicalDemoScenario({ diagnosis: "Type 2 diabetes", age: 62,
            diabetes_context: { cardiovascular_risk: "Very high", renal_function: "Moderate to severe reduction", fragility: "Low", tolerance: "Well tolerated", glycemic_goals: "Individualized" } });
        expect(english).toEqual(french);
        expect(getClinicalDemoScenario({ diagnosis: "Type 2 diabetes", age: 60,
            diabetes_context: { fragility: "High", tolerance: "Limited", cardiovascular_risk: "High", renal_function: "Preserved", glycemic_goals: "Individualized" } }).relevanceByAgeChart?.subtitle).toContain("profile with explicitly reported frailty");
    });

    it("keeps simulated English content and safety qualifiers across diagnoses", () => {
        for (const diagnosis of ["Hypertension", "Cataract", "Gastric cancer", "Infectious mononucleosis", "Major depressive disorder", "Type 2 diabetes"]) {
            const scenario = getClinicalDemoScenario({ diagnosis });
            expect(scenario.questions.every(({ answer }) => answer.startsWith("Simulated data:"))).toBe(true);
            expect(scenario.treatments.every(({ details }) => details.startsWith("Simulated data:"))).toBe(true);
        }
        const diabetes = getClinicalDemoScenario({ diagnosis: "Type 2 diabetes" });
        expect(diabetes.treatments.find(({id}) => id === "glp1-review")?.details).toContain("without automatically replacing metformin or the physician's clinical judgment");
        expect(diabetes.relevanceByAgeChart?.subtitle).toContain("Does not represent a quantitative measure of efficacy");
    });
    it("does not classify low frailty as a frail profile from an English substring", () => {
        const scenario = getClinicalDemoScenario({ diagnosis: "Type 2 diabetes", age: 60,
            diabetes_context: { fragility: "Low frailty", tolerance: "Well tolerated", cardiovascular_risk: "Moderate", renal_function: "Preserved", glycemic_goals: "Individualized" } });
        expect(scenario.relevanceByAgeChart?.subtitle).not.toContain("profile with explicitly reported frailty");
    });

    it.each([
        { age: 78, fragility: "Low", tolerance: "Metformin well tolerated" },
        { age: 95, fragility: undefined, tolerance: undefined },
        { age: 78, fragility: "Unknown", tolerance: "Limited" },
        { age: 55, fragility: "Low", tolerance: "Limited" },
        { age: 55, fragility: "Faible", tolerance: "Tolerance digestive limitee" },
        { age: 78, fragility: "non fragile", tolerance: "reassess" },
        { age: 78, fragility: "not frail", tolerance: "Well tolerated" },
        { age: 78, fragility: "Low frailty", tolerance: "Well tolerated" },
    ])("does not infer frailty from age, tolerability, missing or negated context: %j", ({ age, fragility, tolerance }) => {
        const chart = getClinicalDemoScenario({ diagnosis: "Type 2 diabetes", age,
            diabetes_context: { fragility, tolerance, cardiovascular_risk: "Moderate", renal_function: "Preserved" },
        }).relevanceByAgeChart;
        expect(chart?.subtitle).not.toContain("explicitly reported frailty");
        expect(chart?.series.find(({name}) => name === "Metformin")?.values).toEqual([5, 5, 5, 4, 4]);
        expect(chart?.interpretationNote).toContain("Missing frailty information does not establish low frailty");
    });

    it.each(["High", "High frailty", "Élevée", "Fragilité élevée"])("recognizes explicitly reported frailty independently of age: %s", (fragility) => {
        const chart = getClinicalDemoScenario({ diagnosis: "Type 2 diabetes", age: 55,
            diabetes_context: { fragility, tolerance: "Well tolerated" },
        }).relevanceByAgeChart;
        expect(chart?.subtitle).toContain("profile with explicitly reported frailty");
        expect(chart?.interpretationNote).toContain("assess cardiovascular and renal risks separately");
    });

    it("does not let older age override an explicitly low-frailty cardiorenal context", () => {
        const chart = getClinicalDemoScenario({ diagnosis: "Type 2 diabetes", age: 78,
            diabetes_context: { fragility: "Low", cardiovascular_risk: "Very high", renal_function: "Moderate to severe reduction" },
        }).relevanceByAgeChart;
        expect(chart?.subtitle).toContain("high-risk cardiorenal profile");
        expect(chart?.subtitle).not.toContain("explicitly reported frailty");
    });

});
