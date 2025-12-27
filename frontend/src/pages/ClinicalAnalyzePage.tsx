import { useEffect, useState } from "react";
import { ClinicalForm } from "../components/clinical/ClinicalForm";
import { ClinicalResultPage } from "./ClinicalResultPage";
import { analyzeClinicalCase } from "../services/clinicalApi";

import type { ClinicalPayload, ClinicalAnalysis } from "../types/clinical";
import type { ApiResponse, ApiFailure } from "../types/api";

/* ------------------------------------------------------------------ */
/* Preset clinique par défaut (sécurisé)                               */
/* ------------------------------------------------------------------ */

const DEFAULT_CLINICAL_PAYLOAD: ClinicalPayload = {
    age: 55,
    sex: "male",
    weight: 92,
    height: 175,
    blood_pressure: {
        systolic: 145,
        diastolic: 92,
    },
    symptoms: ["Polyurie", "Polydipsie", "Fatigue"], // 🔒 jamais vide
    medical_history: ["Diabète de type 2"],
    current_medications: ["Metformine"],
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
    const [warning, setWarning] = useState<string>();

    /**
     * 🧹 Nettoyage cache UNE SEULE FOIS à l’arrivée sur /clinical
     * - dépendances vides
     * - aucun setState
     * - AUCUNE boucle possible
     */
    useEffect(() => {
        localStorage.removeItem("clinia_last_clinical_payload");
    }, []);

    /* ------------------------------------------------------------------ */
    /* Soumission                                                        */
    /* ------------------------------------------------------------------ */

    async function handleSubmit(payload: ClinicalPayload) {
        setLoading(true);
        setWarning(undefined);

        // 🛡️ Sécurité ultime : on n’envoie JAMAIS un payload invalide
        const safePayload: ClinicalPayload = {
            ...payload,
            symptoms:
                payload.symptoms && payload.symptoms.length > 0
                    ? payload.symptoms
                    : DEFAULT_CLINICAL_PAYLOAD.symptoms,
        };

        let response: ApiResponse<ClinicalAnalysis>;

        try {
            response = await analyzeClinicalCase(safePayload);
        } catch (err) {
            console.error("Erreur réseau:", err);
            setWarning("Erreur réseau. Impossible de contacter ClinIA.");
            setLoading(false);
            return;
        }

        if (isApiError(response)) {
            switch (response.error.source) {
                case "openai":
                    setWarning(
                        "Le service d’analyse médicale (IA) est temporairement indisponible."
                    );
                    break;

                case "mongo":
                    // 🧠 Cache Mongo : PAS une erreur utilisateur
                    console.warn("Analyse récupérée depuis le cache Mongo");
                    break;

                case "internal":
                default:
                    setWarning(response.error.message);
            }

            setResult(null);
            setActiveTab("patient");
            setLoading(false);
            return;
        }

        // ✅ SUCCÈS
        setResult(response.data);
        setActiveTab("clinical");
        setLoading(false);
    }

    /* ------------------------------------------------------------------ */
    /* Render                                                             */
    /* ------------------------------------------------------------------ */

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            {activeTab === "patient" && !result && (
                <ClinicalForm
                    onSubmit={handleSubmit}
                    loading={loading}
                    warningMessage={warning}
                    initialData={DEFAULT_CLINICAL_PAYLOAD}
                />
            )}

            {activeTab === "clinical" && result && (
                <ClinicalResultPage data={result} />
            )}
        </div>
    );
}
