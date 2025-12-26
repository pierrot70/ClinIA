// src/types/clinical.ts

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
