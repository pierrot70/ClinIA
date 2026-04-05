import { describe, expect, it } from "vitest";

import {
    extractPrimaryClinicalConcern,
    isPlaceholderClinicalAnalysis,
    normalizeClinicalAnalysis,
} from "../clinicalAnalysis.js";

describe("clinicalAnalysis utils", () => {
    it("extracts the main symptom from a structured summary", () => {
        expect(
            extractPrimaryClinicalConcern({
                symptoms: [
                    "Main symptom: Hypertension | Symptom duration: < 24h | Severity: Mild",
                ],
            })
        ).toBe("Hypertension");
    });

    it("detects the normalized placeholder response", () => {
        const normalized = normalizeClinicalAnalysis({});

        expect(isPlaceholderClinicalAnalysis(normalized)).toBe(true);
    });

    it("does not treat a meaningful analysis as placeholder", () => {
        const normalized = normalizeClinicalAnalysis({
            diagnosis: {
                suspected: "Hypertension artérielle",
                certainty_level: "high",
                justification: "Pression élevée répétée et contexte compatible.",
            },
            treatments: [
                {
                    name: "Amlodipine",
                    indication: "Contrôle tensionnel",
                },
            ],
            patient_summary: {
                plain_language: "Une hypertension est suspectée.",
                clinical_language: "HTA probable avec besoin de suivi tensionnel.",
            },
        });

        expect(isPlaceholderClinicalAnalysis(normalized)).toBe(false);
    });

    it("maps therapeutic options payloads into standard fields", () => {
        const normalized = normalizeClinicalAnalysis(
            {
                therapeutic_options: {
                    lifestyle_modifications: ["DASH diet"],
                    pharmacologic_treatment: [
                        {
                            first_line_agents: ["Amlodipine"],
                            selection_considerations: "Depends on patient context.",
                        },
                    ],
                },
                monitoring_considerations: {
                    blood_pressure: "Check BP regularly",
                },
                contraindications: {
                    ace_inhibitors: "Avoid in pregnancy",
                },
                patient_summary: "Summary for patient",
                red_flags: ["Hypertensive emergency"],
            },
            { primaryConcern: "Hypertension" }
        );

        expect(normalized.diagnosis.suspected).toBe("Hypertension");
        expect(normalized.patient_summary.plain_language).toBe("Summary for patient");
        expect(normalized.treatments).toHaveLength(2);
        expect(normalized.treatments[0].name).toBe("DASH diet");
        expect(normalized.treatments[1].name).toBe("Amlodipine");
        expect(normalized.treatments[1].monitoring).toContain("Check BP regularly");
        expect(normalized.treatments[1].contraindications).toContain("Avoid in pregnancy");
    });

    it("maps legacy cached other_ai_fields payloads into standard fields", () => {
        const normalized = normalizeClinicalAnalysis(
            {
                diagnosis: {
                    suspected: "Analyse clinique en cours",
                    certainty_level: "moderate",
                    justification: "Analyse basée sur données cliniques disponibles.",
                },
                treatments: [],
                patient_summary: {
                    plain_language: "Résumé patient généré par ClinIA.",
                    clinical_language: "Analyse clinique structurée.",
                },
                other_ai_fields: {
                    therapeutic_options: {
                        lifestyle_modifications: ["DASH diet"],
                    },
                    monitoring_considerations: {
                        blood_pressure: "Check BP regularly",
                    },
                },
            },
            { primaryConcern: "Hypertension" }
        );

        expect(normalized.diagnosis.suspected).toBe("Analyse clinique en cours");
        expect(normalized.treatments).toHaveLength(1);
        expect(normalized.treatments[0].name).toBe("DASH diet");
        expect(normalized.treatments[0].monitoring).toContain("Check BP regularly");
    });
});