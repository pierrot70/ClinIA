import { useEffect, useState } from "react";
import { ClinicalForm } from "../components/clinical/ClinicalForm";
import { ClinicalResultPage } from "./ClinicalResultPage";
import { analyzeClinicalCase } from "../services/clinicalApi";

import type { ClinicalPayload, ClinicalAnalysis } from "../types/clinical";
import type { ApiResponse, ApiError } from "../types/api";

/* ------------------------------------------------------------------ */
/* Preset clinique par défaut (JAMAIS invalide)                        */
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

type OpenAIModel = "gpt-4.1-mini" | "gpt-4-0613";

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function ClinicalAnalyzePage() {
    const [activeTab, setActiveTab] =
        useState<"patient" | "clinical">("patient");

    const [result, setResult] = useState<ClinicalAnalysis | null>(null);
    const [loading, setLoading] = useState(false);

    const [apiError, setApiError] = useState<ApiError | null>(null);
    const [serviceMode, setServiceMode] =
        useState<"real" | "mock" | "degraded" | null>(null);

    const [forceReal, setForceReal] = useState(false);
    const [openaiModel, setOpenaiModel] =
        useState<OpenAIModel>("gpt-4.1-mini");

    const [lastPayload, setLastPayload] =
        useState<ClinicalPayload | null>(null);

    /* ------------------------------------------------------------------ */
    /* Nettoyage cache à l’entrée (1 seule fois)                          */
    /* ------------------------------------------------------------------ */

    useEffect(() => {
        localStorage.removeItem("clinia_last_clinical_payload");
    }, []);

    /* ------------------------------------------------------------------ */
    /* 🔁 Changement de modèle → retour au formulaire                     */
    /* ------------------------------------------------------------------ */

    function handleModelChange(model: OpenAIModel) {
        setOpenaiModel(model);

        // RESET UI volontaire et explicite
        setResult(null);
        setApiError(null);
        setServiceMode(null);
        setLastPayload(null);
        setActiveTab("patient");
    }

    /* ------------------------------------------------------------------ */
    /* Analyse centrale                                                   */
    /* ------------------------------------------------------------------ */

    async function runAnalysis(
        payload: ClinicalPayload & {
            forceReal?: boolean;
            openaiModel?: OpenAIModel;
        }
    ) {
        setLoading(true);
        setApiError(null);

        const response: ApiResponse<ClinicalAnalysis> =
            await analyzeClinicalCase(payload);

        if ("error" in response) {
            setApiError(response.error);
            setResult(null);
            setServiceMode(null);
            setActiveTab("patient");
            setLoading(false);
            return;
        }

        setResult(response.data);
        setServiceMode(response.meta.source);
        setActiveTab("clinical");
        setLoading(false);
    }

    /* ------------------------------------------------------------------ */
    /* Soumission utilisateur                                             */
    /* ------------------------------------------------------------------ */

    async function handleSubmit(payload: ClinicalPayload) {
        const safePayload = {
            ...payload,
            symptoms:
                payload.symptoms.length > 0
                    ? payload.symptoms
                    : DEFAULT_CLINICAL_PAYLOAD.symptoms,
            forceReal,
            openaiModel,
        };

        setLastPayload(safePayload);
        await runAnalysis(safePayload);
    }

    /* ------------------------------------------------------------------ */
    /* Retry                                                             */
    /* ------------------------------------------------------------------ */

    function retry() {
        if (lastPayload) {
            runAnalysis({
                ...lastPayload,
                forceReal,
                openaiModel,
            });
        }
    }

    /* ------------------------------------------------------------------ */
    /* Render                                                             */
    /* ------------------------------------------------------------------ */

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">

            {/* ❌ Erreur backend brute (sans flafla) */}
            {apiError && (
                <div className="text-red-600 text-sm">
                    {apiError.message}
                </div>
            )}

            {/* ⚙️ Sélection modèle */}
            <div className="flex items-center gap-3">
                <label className="text-sm font-medium">
                    Modèle OpenAI
                </label>

                <select
                    value={openaiModel}
                    onChange={(e) =>
                        handleModelChange(
                            e.target.value as OpenAIModel
                        )
                    }
                    className="border rounded px-2 py-1 text-sm"
                >
                    <option value="gpt-4.1-mini">
                        gpt-4.1-mini (JSON natif)
                    </option>
                    <option value="gpt-4-0613">
                        gpt-4-0613 (legacy)
                    </option>
                </select>
            </div>

            {/* 🔀 Toggle IA réelle */}
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => setForceReal((v) => !v)}
                    disabled={serviceMode === "degraded"}
                    className={`px-3 py-1 rounded text-sm border transition
                        ${
                        forceReal
                            ? "bg-red-600 text-white border-red-600"
                            : "bg-gray-100 text-gray-700 border-gray-300"
                    }
                        ${
                        serviceMode === "degraded"
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                    }
                    `}
                >
                    {forceReal
                        ? "IA réelle activée"
                        : "Mode simulation"}
                </button>
            </div>

            {/* 🧑‍⚕️ Formulaire */}
            {activeTab === "patient" && !result && (
                <ClinicalForm
                    onSubmit={handleSubmit}
                    loading={loading}
                    initialData={DEFAULT_CLINICAL_PAYLOAD}
                />
            )}

            {/* 📊 Résultat */}
            {activeTab === "clinical" && result && (
                <ClinicalResultPage
                    data={result}
                    serviceMode={serviceMode}
                />
            )}
        </div>
    );
}
