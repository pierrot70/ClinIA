import { useEffect, useState } from "react";
import { ClinicalForm } from "../components/clinical/ClinicalForm";
import { ClinicalResultPage } from "./ClinicalResultPage";
import { ServiceStatusBanner } from "../components/system/ServiceStatusBanner";
import { analyzeClinicalCase } from "../services/clinicalApi";

import type { ClinicalPayload, ClinicalAnalysis } from "../types/clinical";
import type { ApiResponse, ApiError } from "../types/api";

/* ------------------------------------------------------------------ */
/* Preset clinique par défaut (sécurisé, jamais invalide)              */
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
    symptoms: ["Polyurie", "Polydipsie", "Fatigue"],
    medical_history: ["Diabète de type 2"],
    current_medications: ["Metformine"],
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function ClinicalAnalyzePage() {
    const [activeTab, setActiveTab] = useState<"patient" | "clinical">("patient");
    const [result, setResult] = useState<ClinicalAnalysis | null>(null);
    const [loading, setLoading] = useState(false);

    /** Dernière erreur API normalisée */
    const [apiError, setApiError] = useState<ApiError | null>(null);

    /** Dernier payload valide (pour retry intelligent) */
    const [lastPayload, setLastPayload] =
        useState<ClinicalPayload | null>(null);

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
    /* Analyse (appel réel + retry)                                       */
    /* ------------------------------------------------------------------ */

    async function runAnalysis(payload: ClinicalPayload) {
        setLoading(true);
        setApiError(null);

        const response: ApiResponse<ClinicalAnalysis> =
            await analyzeClinicalCase(payload);

        // ❌ ERREUR NORMALISÉE
        if ("error" in response) {
            setApiError(response.error);
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
    /* Soumission initiale                                                */
    /* ------------------------------------------------------------------ */

    async function handleSubmit(payload: ClinicalPayload) {
        // 🛡️ Sécurité ultime : jamais de payload invalide
        const safePayload: ClinicalPayload = {
            ...payload,
            symptoms:
                payload.symptoms && payload.symptoms.length > 0
                    ? payload.symptoms
                    : DEFAULT_CLINICAL_PAYLOAD.symptoms,
        };

        setLastPayload(safePayload);
        await runAnalysis(safePayload);
    }

    /* ------------------------------------------------------------------ */
    /* Retry intelligent                                                  */
    /* ------------------------------------------------------------------ */

    function retry() {
        if (lastPayload) {
            runAnalysis(lastPayload);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Render                                                             */
    /* ------------------------------------------------------------------ */

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            {/* 🔔 Bannière système (résilience visible) */}
            {apiError && (
                <ServiceStatusBanner
                    error={apiError}
                    onRetry={apiError.retryable ? retry : undefined}
                />
            )}

            {/* 🧑‍⚕️ Formulaire clinique */}
            {activeTab === "patient" && !result && (
                <ClinicalForm
                    onSubmit={handleSubmit}
                    loading={loading}
                    initialData={DEFAULT_CLINICAL_PAYLOAD}
                />
            )}

            {/* 📊 Résultat clinique */}
            {activeTab === "clinical" && result && (
                <ClinicalResultPage data={result} />
            )}
        </div>
    );
}
