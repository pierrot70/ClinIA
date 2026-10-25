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
        expect(normalized.treatments[1].monitoring).toEqual([]);
        expect(normalized.other_ai_fields.monitoring_considerations.blood_pressure).toBe("Check BP regularly");
        expect(normalized.treatments[1].contraindications).toEqual([]);
        expect(normalized.treatments[0].contraindications).toEqual([]);
        expect(normalized.other_ai_fields.contraindications.ace_inhibitors).toBe("Avoid in pregnancy");
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
        expect(normalized.treatments[0].monitoring).toEqual([]);
    });
});

it("uses English clinical fallback content independently of interface language", () => {
    const output = normalizeClinicalAnalysis({ treatments: [{}] });
    expect(output.diagnosis.suspected).toBe("Clinical analysis in progress");
    expect(output.diagnosis.justification).toBe("Analysis based on the available clinical data.");
    expect(output.patient_summary).toEqual({ plain_language: "Patient summary generated by ClinIA.", clinical_language: "Structured clinical analysis." });
    expect(output.treatments[0].name).toBe("Unspecified treatment");
});

it("preserves existing authored clinical text in its original language", () => {
    const note = "Texte clinique original : douleur depuis trois jours.";
    const output = normalizeClinicalAnalysis({ patient_summary: { plain_language: note }, clinical_summary: note });
    expect(output.patient_summary.plain_language).toBe(note);
    expect(output.clinical_summary).toBe(note);
});


it("preserves a historical French treatment rationale verbatim without reclassifying it", () => {
    const rationale = "Justification originale : option à discuter selon le contexte clinique.";
    const raw = { treatments: [{ name: "Option historique", justification: rationale }] };
    const before = JSON.stringify(raw);
    const output = normalizeClinicalAnalysis(raw);
    expect(output.treatments[0].justification).toBe(rationale);
    expect(output.treatments[0].indication).toBe("");
    expect(JSON.stringify(raw)).toBe(before);
});

describe("authored option fields and structured response boundaries", () => {
    it("preserves authored details, rationale and references on explicit and cached normalized options without mutating input", () => {
        const authored = { name: "Synthetic option", indication: "Option category", justification: " Rationale — sin cambio ", details: " Authored detail ", summary: "Authored summary", references: [{name:"Source title",url:"https://example.test/source"}], monitoring:["Own monitoring"], contraindications:["Own restriction"] };
        const raw = { treatments:[authored] };
        const before = structuredClone(raw);
        const result = normalizeClinicalAnalysis(raw);
        expect(result.treatments[0]).toMatchObject(authored);
        expect(normalizeClinicalAnalysis(result).treatments[0]).toMatchObject(authored);
        expect(raw).toEqual(before);
    });
    it("maps explicitly named structured options without treating named references or global monitoring as drugs", () => {
        const raw = { treatment_options: { references:[{name:"A guideline",url:"https://example.test"}], monitoring:[{name:"Global BP check"}], options:[{name:"Authored option",rationale:"Original rationale",contraindications:["Own only"]}] }, contraindications:{unrelated:["Global restriction"]} };
        const result = normalizeClinicalAnalysis(raw);
        expect(result.treatments.map(t=>t.name)).toEqual(["Authored option"]);
        expect(result.treatments[0]).toMatchObject({justification:"Original rationale",contraindications:["Own only"],monitoring:[]});
        expect(result.treatment_options).toEqual(raw.treatment_options);
    });
    it("retains unrecognized option structures as original fields without inventing named treatments", () => {
        const raw = { treatment_options:{current_strategy:{recommendation:"Authored recommendation",details:["Original detail"]}, evidence:{name:"A source"}} };
        const result = normalizeClinicalAnalysis(raw);
        expect(result.treatments).toEqual([]);
        expect(result.treatment_options).toEqual(raw.treatment_options);
    });
    it("preserves structured rationale in source_fields while keeping display fields string-safe", () => {
        const rationale={reason:"Original rationale",qualifier:"Uncertain"};
        const raw={treatment_options:[{name:"Authored option",rationale,details:["Original detail"],references:[{name:"Source"}]}]};
        const result=normalizeClinicalAnalysis(raw);
        expect(result.treatments[0].justification).toBe("");
        expect(result.treatments[0].details).toBeUndefined();
        expect(result.treatments[0].source_fields).toEqual(raw.treatment_options[0]);
    });
});
