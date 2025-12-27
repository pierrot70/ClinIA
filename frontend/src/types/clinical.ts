// src/types/clinical.ts

/* ------------------------------------------------------------------ */
/* Payload envoyé au backend                                           */
/* ------------------------------------------------------------------ */

export type Sex = "male" | "female" | "other";

export interface ClinicalPayload {
    age: number;
    sex: Sex;

    weight?: number;
    height?: number;

    blood_pressure?: {
        systolic?: number;
        diastolic?: number;
    };

    symptoms: string[];
    medical_history: string[];
    current_medications: string[];
}

/* ------------------------------------------------------------------ */
/* Analyse retournée par ClinIA                                        */
/* ------------------------------------------------------------------ */

export type CertaintyLevel = "low" | "moderate" | "high";
export type EvidenceLevel = "A" | "B" | "C";

export interface ClinicalAnalysis {
    diagnosis: {
        suspected: string;
        certainty_level: CertaintyLevel;
        justification: string;
    };

    treatments: {
        name: string;
        indication: string;
        dosage: string;
        duration: string;
        contraindications: string[];
        monitoring: string[];
        evidence_level: EvidenceLevel;
    }[];

    alternatives: {
        name: string;
        reason: string;
    }[];

    red_flags: string[];

    patient_summary: {
        plain_language: string;
        clinical_language: string;
    };

    meta: {
        model: string;
        confidence_score: number;
    };
}
