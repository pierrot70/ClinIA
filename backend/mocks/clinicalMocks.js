// backend/mocks/clinicalMocks.js

export const mockHypertension = {
    patient_summary:
        "Your blood pressure is high. A combination of lifestyle changes and medication can help lower it.",
    treatments: [
        {
            name: "Lifestyle changes",
            justification:
                "Always recommended before or in combination with medication.",
            contraindications: [],
            efficacy: 55
        },
        {
            name: "Amlodipine",
            justification:
                "An effective calcium channel blocker in older patients.",
            contraindications: ["Severe hypotension"],
            efficacy: 82
        },
        {
            name: "Ramipril",
            justification:
                "An effective first-line ACE inhibitor, especially with renal involvement.",
            contraindications: ["Pregnancy", "Angioedema"],
            efficacy: 88
        }
    ]
};

export const mockDiabetes = {
    patient_summary:
        "This simulated example concerns elevated blood glucose in a type 2 diabetes context. Treatments and lifestyle changes can help stabilize blood glucose.",
    treatments: [
        {
            name: "Metformin",
            justification:
                "A recommended, well-tolerated first-line treatment.",
            contraindications: ["Severe renal impairment"],
            efficacy: 90
        },
        {
            name: "Weight loss",
            justification:
                "May improve insulin sensitivity and lower blood glucose.",
            contraindications: [],
            efficacy: 60
        },
        {
            name: "SGLT2 inhibitors",
            justification:
                "Promote glucose excretion in the urine.",
            contraindications: ["History of severe urinary tract infections"],
            efficacy: 75
        }
    ]
};

export const mockCholesterol = {
    patient_summary:
        "Your cholesterol level is too high. Lowering LDL helps reduce cardiovascular risks.",
    treatments: [
        {
            name: "Statins",
            justification:
                "A standard treatment for reducing LDL and cardiovascular events.",
            contraindications: ["Active liver disease"],
            efficacy: 85
        },
        {
            name: "Increased physical activity",
            justification: "Improves the overall lipid profile.",
            contraindications: [],
            efficacy: 40
        },
        {
            name: "Ezetimibe",
            justification:
                "Used when statins are insufficient or poorly tolerated.",
            contraindications: [],
            efficacy: 65
        }
    ]
};

export const mockAsthma = {
    patient_summary:
        "You have symptoms of asthma. Treatment helps improve breathing and prevent attacks.",
    treatments: [
        {
            name: "Inhaled corticosteroids",
            justification:
                "Baseline treatment to reduce bronchial inflammation.",
            contraindications: [],
            efficacy: 90
        },
        {
            name: "Bronchodilators",
            justification:
                "Help open the airways during the acute phase.",
            contraindications: ["Severe arrhythmias"],
            efficacy: 80
        }
    ]
};

export const mockMigraine = {
    patient_summary:
        "You have a migraine. Some treatments can reduce pain and prevent attacks.",
    treatments: [
        {
            name: "Triptans",
            justification:
                "An effective treatment for acute migraine attacks.",
            contraindications: ["Coronary artery disease"],
            efficacy: 75
        },
        {
            name: "Beta blockers",
            justification:
                "Used to prevent attacks.",
            contraindications: ["Severe asthma"],
            efficacy: 65
        },
        {
            name: "Rest in a dark place",
            justification:
                "Reduces stimuli that worsen the attack.",
            contraindications: [],
            efficacy: 30
        }
    ]
};

export const mockHeartFailure = {
    patient_summary:
        "You have heart failure. Some treatments can ease symptoms, protect the heart and reduce the risk of hospitalization.",
    treatments: [
        {
            name: "SGLT2 inhibitors (e.g., dapagliflozin)",
            justification:
                "Have demonstrated a reduction in hospitalizations and mortality, even in people without diabetes.",
            contraindications: ["Severe renal impairment", "Dehydration"],
            efficacy: 85
        },
        {
            name: "Beta blockers",
            justification:
                "Slow the heart rate and reduce the heart's workload.",
            contraindications: ["Severe asthma", "Bradycardia"],
            efficacy: 75
        },
        {
            name: "Loop diuretics (e.g., furosemide)",
            justification:
                "Reduce congestion, edema and dyspnea.",
            contraindications: ["Dehydration", "Acute renal impairment"],
            efficacy: 65
        }
    ]
};

export function getMockForDiagnosis(diagnosis = "") {
    const d = diagnosis.toLowerCase();

    if (d.includes("hyperten"))
        return mockHypertension;

    if (d.includes("diab"))
        return mockDiabetes;

    if (d.includes("cholest"))
        return mockCholesterol;

    if (d.includes("asth"))
        return mockAsthma;

    if (d.includes("migra"))
        return mockMigraine;

    if (d.includes("insuffis") || d.includes("cardia") || d.includes("icc") || d.includes("heart fail"))
        return mockHeartFailure;

    // fallback générique
    return {
        patient_summary:
            "No specific mock found; here is a generic example.",
        treatments: []
    };
}
