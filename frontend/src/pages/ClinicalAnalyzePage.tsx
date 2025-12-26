import { useState } from "react";
import { ClinicalForm } from "../components/clinical/ClinicalForm";
import { ClinicalResultPage } from "./ClinicalResultPage";
import { analyzeClinicalCase } from "../services/clinicalApi";
import type { ApiResponse, ApiFailure } from "../types/api";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type ClinicalPayload = {
    age: number;
    sex: "male" | "female" | "other";
    weight?: number;
    height?: number;
    blood_pressure?: {
        systolic?: number;
        diastolic?: number;
    };
    symptoms: string[];
    medical_history: string[];
    current_medications: string[];
};

type ClinicalAnalysis = {
    diagnosis: {
        suspected: string;
        certainty_level: "low" | "moderate" | "high";
        justification: string;
    };
    treatments: any[];
    alternatives: any[];
    red_flags: string[];
    patient_summary: {
        plain_language: string;
        clinical_language: string;
    };
    meta?: {
        model?: string;
        confidence_score?: number;
    };
};

/* ------------------------------------------------------------------ */
/* Type guard                                                          */
/* ------------------------------------------------------------------ */

function isApiError<T>(response: ApiResponse<T>): response is ApiFailure {
    return "error" in response;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function ClinicalAnalyzePage() {
    const [activeTab, setActiveTab] = useState<"patient" | "clinical">("patient");
    const [result, setResult] = useState<ClinicalAnalysis | null>(null);
    const [loading, setLoading] = useState(false);
    const [warning, setWarning] = useState<string | undefined>();

    async function handleSubmit(payload: ClinicalPayload) {
        setLoading(true);
        setWarning(undefined);

        const response = await analyzeClinicalCase(payload);

        if (isApiError(response)) {
            switch (response.error.source) {
                case "openai":
                    setWarning(
                        "Le service d’analyse médicale (IA) est temporairement indisponible."
                    );
                    break;
                case "mongo":
                    setWarning(
                        "L’analyse a été effectuée, mais n’a pas pu être sauvegardée."
                    );
                    break;
                default:
                    setWarning(response.error.message);
            }

            setResult(null);
            setActiveTab("patient");
            setLoading(false);
            return;
        }

        // ✅ SUCCESS
        setResult(response.data);
        setActiveTab("clinical");
        setLoading(false);
    }

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            {activeTab === "patient" && !result && (
                <ClinicalForm
                    onSubmit={handleSubmit}
                    loading={loading}
                    warningMessage={warning}
                />
            )}

            {activeTab === "clinical" && result && (
                <ClinicalResultPage data={result} />
            )}
        </div>
    );
}
