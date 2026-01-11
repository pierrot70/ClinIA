import type { ClinicalPayload } from "../types/clinical";

export const DEFAULT_CLINICAL_PAYLOAD: ClinicalPayload = {
    age: 55,
    sex: "male",

    weight: 82,
    height: 175,

    blood_pressure: {
        systolic: 140,
        diastolic: 90,
    },

    symptoms: ["hypertension"],
    medical_history: ["dyslipidémie"],
    current_medications: ["aucune"],
};
