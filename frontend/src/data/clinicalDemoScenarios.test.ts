import { describe, expect, it } from "vitest";

import { getClinicalDemoScenario } from "./clinicalDemoScenarios";

describe("clinical demo scenarios", () => {
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
            "profil plus age et fragile"
        );
        expect(
            stableScenario.relevanceByAgeChart?.series.find(
                (item) => item.name === "Poursuite prudente de la strategie actuelle"
            )?.values
        ).toEqual([2, 2, 3, 4, 4]);
        expect(
            frailScenario.relevanceByAgeChart?.series.find(
                (item) => item.name === "Poursuite prudente de la strategie actuelle"
            )?.values
        ).toEqual([2, 2, 3, 4, 5]);
        expect(
            frailScenario.relevanceByAgeChart?.series.find(
                (item) => item.name === "Metformine"
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
            "profil cardio-renal a haut risque"
        );
        expect(
            scenario.relevanceByAgeChart?.series.find(
                (item) => item.name === "Inhibiteur SGLT2"
            )?.values
        ).toEqual([3, 4, 5, 5, 5]);
        expect(
            scenario.relevanceByAgeChart?.series.find(
                (item) => item.name === "Poursuite prudente de la strategie actuelle"
            )?.values
        ).toEqual([1, 2, 2, 3, 3]);
    });
});
