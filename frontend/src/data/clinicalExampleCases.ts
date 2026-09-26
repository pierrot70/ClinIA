import type { ClinicalPayload, DiabetesClinicalContext } from "../types/clinical";

// Medical content: fixed English terminology, independent of the UI language.
// Synthetic examples only; these values are not therapeutic recommendations.
export const DEFAULT_DIABETES_CONTEXT: DiabetesClinicalContext = {
    cardiovascular_risk: "Moderate to high",
    renal_function: "Preserved or mildly reduced",
    fragility: "Low",
    tolerance: "Metformin well tolerated",
    glycemic_goals: "HbA1c < 7% if safe and realistic",
};

export const EXAMPLE_CASES: Record<string, ClinicalPayload> = {
    hypertension55: {
        age: 55,
        sex: "male",
        diagnosis: "Hypertension",
        weight: 92,
        height: 175,
        blood_pressure: {
            systolic: 145,
            diastolic: 92,
        },
        symptoms: ["Headache", "Elevated blood pressure"],
        medical_history: ["Dyslipidemia"],
        current_medications: ["None"],
    },
    gastricCancer59: {
        age: 59,
        sex: "female",
        diagnosis: "Gastric cancer",
        weight: 63,
        height: 165,
        symptoms: ["Epigastric pain", "Weight loss", "Nausea"],
        medical_history: ["Anemia"],
        current_medications: ["Pantoprazole"],
    },
    mononucleosis35: {
        age: 35,
        sex: "female",
        diagnosis: "Infectious mononucleosis",
        weight: 60,
        height: 168,
        symptoms: ["Severe fatigue", "Fever", "Cervical lymphadenopathy"],
        medical_history: [],
        current_medications: ["None"],
    },
    cataract72: {
        age: 72,
        sex: "female",
        diagnosis: "Cataract",
        weight: 68,
        height: 162,
        symptoms: ["Progressive blurred vision", "Glare", "Reduced visual acuity"],
        medical_history: ["Type 2 diabetes"],
        current_medications: ["Metformin"],
    },
    majorDepression42: {
        age: 42,
        sex: "male",
        diagnosis: "Major depressive disorder",
        weight: 81,
        height: 178,
        symptoms: ["Depressed mood", "Insomnia", "Loss of interest", "Fatigue"],
        medical_history: ["Generalized anxiety"],
        current_medications: ["None"],
    },
    diabetesType255: {
        age: 55,
        sex: "male",
        diagnosis: "Type 2 diabetes",
        weight: 94,
        height: 176,
        symptoms: ["Polydipsia", "Polyuria", "Fatigue"],
        medical_history: ["Hypertension"],
        current_medications: ["Metformin"],
        diabetes_context: { ...DEFAULT_DIABETES_CONTEXT },
    },
};

export const COMPARISON_CASE_ONE: ClinicalPayload = {
    age: 58,
    sex: "male",
    country: "CA",
    ethnicity: "caucasian",
    diagnosis: "Type 2 diabetes",
    symptoms: ["Persistent hyperglycemia", "Progressive weight gain", "Fatigue"],
    medical_history: [
        "Hypertension",
        "Dyslipidemia",
        "Atherosclerotic cardiovascular disease",
    ],
    current_medications: ["Metformin"],
    diabetes_context: {
        cardiovascular_risk: "High",
        renal_function: "Preserved or mildly reduced",
        fragility: "Low",
        tolerance: "Metformin well tolerated",
        glycemic_goals: "HbA1c < 7% if safe and realistic",
    },
};

export const COMPARISON_CASE_TWO: ClinicalPayload = {
    age: 58,
    sex: "male",
    country: "CA",
    ethnicity: "caucasian",
    diagnosis: "Type 2 diabetes",
    symptoms: ["Persistent hyperglycemia", "Progressive weight gain", "Fatigue"],
    medical_history: [
        "Hypertension",
        "Dyslipidemia",
        "Atherosclerotic cardiovascular disease",
    ],
    current_medications: ["Metformin", "Empagliflozin"],
    diabetes_context: {
        cardiovascular_risk: "High",
        renal_function: "Preserved or mildly reduced",
        fragility: "Low",
        tolerance: "Current combination well tolerated",
        glycemic_goals: "HbA1c < 7% if safe and realistic",
    },
};

export const COMPARISON_MEDICATION_OPTIONS = ["Metformin", "Gliclazide", "Empagliflozin", "Sitagliptin", "Semaglutide"];
