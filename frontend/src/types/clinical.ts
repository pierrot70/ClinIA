// src/types/clinical.ts

/* ------------------------------------------------------------------ */
/* Payload envoyé au backend                                           */
/* ------------------------------------------------------------------ */

export type Sex = "male" | "female" | "other";
export type AIServiceSource = "real" | "mock" | "degraded";
export type PatientEthnicity =
    | "caucasian"
    | "black"
    | "asian"
    | "hispanic_latino"
    | "middle_eastern_north_african"
    | "indigenous"
    | "south_asian"
    | "southeast_asian"
    | "mixed"
    | "other"
    | "prefer_not_to_say";

export interface DiabetesClinicalContext {
    cardiovascular_risk?: string;
    renal_function?: string;
    fragility?: string;
    tolerance?: string;
    glycemic_goals?: string;
}

export interface ClinicalPayload {
    age: number;
    sex: Sex;
    country?: string;
    ethnicity?: PatientEthnicity;
    diagnosis?: string;

    weight?: number;
    height?: number;

    blood_pressure?: {
        systolic?: number;
        diastolic?: number;
    };

    symptoms: string[];
    medical_history: string[];
    current_medications: string[];
    diabetes_context?: DiabetesClinicalContext;

    // Champs frontend pour pilotage IA
    forceReal?: boolean;
    openaiModel?: string;
    reverifyRequested?: boolean;
    // Ephemeral control value used only after an explicit security acknowledgement.
    incidentAckId?: string;
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

    clinical_summary?: any;
    recommendations?: any;

    meta: {
        model: string;
        confidence_score: number;
        source?: AIServiceSource; // 👈 AJOUT
    };

    // Champs IA avancés (cancer, etc.)
    initial_evaluation_recommendations?: any;
    treatment_options?: any;
    follow_up_and_monitoring?: any;

    // Champs IA inconnus dynamiques
    other_ai_fields?: Record<string, unknown>;

}
