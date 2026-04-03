import { useEffect, useState, useContext } from "react";
import { ClinicalForm } from "../components/clinical/ClinicalForm";
// import { ClinicalResultPage } from "./ClinicalResultPage";
import ClinicalDemoResult from "../components/ClinicalDemoResult";
import { useClinicalAnalysis } from "../hooks/useClinicalAnalysis";
import { useSecurityIncident } from "../contexts/SecurityIncidentContext";
import {
    acknowledgeSecurityIncident,
    REQUIRED_ACK_ACTION,
} from "../services/securityIncidentApi";
import { SecurityBlockingAlert } from "../components/system/SecurityBlockingAlert";

import { useTranslation } from "../hooks/useTranslation";
import { hypertensionTreatments, anticipatedQuestions } from "../data/hypertension";
import { HomeI18nContext } from "../contexts/HomeI18nContext";

import type { ClinicalPayload, ClinicalAnalysis, Sex } from "../types/clinical";
import type {
    ApiResponse,
    ApiError,
    SecurityIncidentBlockingData,
} from "../types/api";

/* ------------------------------------------------------------------ */
/* Preset clinique par défaut (JAMAIS invalide)                        */
/* ------------------------------------------------------------------ */

// Valeurs par défaut dynamiquement traduites
import { useMemo } from "react";

function useDefaultClinicalPayload(targetLang: string, openaiModel: string) {
    const { translated: symptom1 } = useTranslation({ text: "Polyurie", targetLang, openaiModel });
    const { translated: symptom2 } = useTranslation({ text: "Polydipsie", targetLang, openaiModel });
    const { translated: symptom3 } = useTranslation({ text: "Fatigue", targetLang, openaiModel });
    const { translated: history1 } = useTranslation({ text: "Diabète de type 2", targetLang, openaiModel });
    const { translated: med1 } = useTranslation({ text: "Metformine", targetLang, openaiModel });

    return useMemo(() => ({
        age: 55,
        sex: "male" as Sex,
        weight: 92,
        height: 175,
        blood_pressure: {
            systolic: 145,
            diastolic: 92,
        },
        symptoms: [symptom1, symptom2, symptom3].filter(Boolean),
        medical_history: [history1].filter(Boolean),
        current_medications: [med1].filter(Boolean),
    }), [symptom1, symptom2, symptom3, history1, med1]);
}

type OpenAIModel = "gpt-4.1-mini" | "gpt-4-0613";

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function ClinicalAnalyzePage() {
    const i18n = useContext(HomeI18nContext) || { locale: "fr" };
    const targetLang = i18n.locale;
    const [openaiModel, setOpenaiModel] = useState<OpenAIModel>("gpt-4.1-mini");
    const DEFAULT_CLINICAL_PAYLOAD = useDefaultClinicalPayload(targetLang, openaiModel);
    const isProd = !!import.meta.env.PROD;
    const [activeTab, setActiveTab] =
        useState<"patient" | "clinical">("patient");

    const { result, loading, error, analyze } = useClinicalAnalysis();

    const [apiError, setApiError] = useState<ApiError | null>(null);
    const [blockingIncident, setBlockingIncident] =
        useState<SecurityIncidentBlockingData | null>(null);
    const [acknowledgingIncident, setAcknowledgingIncident] =
        useState(false);
    const [blockingActionableMessage, setBlockingActionableMessage] =
        useState<string | null>(null);
    const [serviceMode, setServiceMode] =
        useState<"real" | "mock" | "degraded" | null>(null);

    const [forceReal, setForceReal] = useState(false);

    const [lastPayload, setLastPayload] =
        useState<ClinicalPayload | null>(null);

    /* ------------------------------------------------------------------ */
    /* Nettoyage cache à l’entrée (1 seule fois)                          */
    /* ------------------------------------------------------------------ */

    useEffect(() => {
        localStorage.removeItem("clinia_last_clinical_payload");
    }, []);
    useEffect(() => {
        if (isProd) {
            localStorage.removeItem("clinia_force_real");
            setForceReal(false);
            return;
        }
        const stored = localStorage.getItem("clinia_force_real");
        setForceReal(stored === "true");

        const handleForceRealChange = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (detail && typeof detail.forceReal === "boolean") {
                setForceReal(detail.forceReal);
            }
        };
        window.addEventListener(
            "clinia:force-real-changed",
            handleForceRealChange
        );
        return () => {
            window.removeEventListener(
                "clinia:force-real-changed",
                handleForceRealChange
            );
        };
    }, [isProd]);

    /* ------------------------------------------------------------------ */
    /* 🔁 Changement de modèle → retour au formulaire                     */
    /* ------------------------------------------------------------------ */

    function handleModelChange(model: OpenAIModel) {
        setOpenaiModel(model);

        // RESET UI volontaire et explicite
        setApiError(null);
        setServiceMode(null);
        setLastPayload(null);
        setActiveTab("patient");
    }

    /* ------------------------------------------------------------------ */
    /* Analyse centrale                                                   */
    /* ------------------------------------------------------------------ */

    // runAnalysis remplacé par le hook useClinicalAnalysis

    async function handleAcknowledgeBlockingIncident() {
        if (!blockingIncident) {
            setBlockingActionableMessage(
                "Incident de securite manquant. Relancez l'analyse pour continuer."
            );
            return;
        }

        setAcknowledgingIncident(true);
        setBlockingActionableMessage(null);

        const ackResponse = await acknowledgeSecurityIncident({
            incidentId: blockingIncident.incident.id,
            action: REQUIRED_ACK_ACTION,
            context: {
                route: "/clinical",
                flow: "clinical_analysis",
                incidentType: blockingIncident.incident.type,
                incidentReason: blockingIncident.incident.reason,
                incidentPhase: blockingIncident.incident.phase,
                incidentTimestamp: blockingIncident.incident.timestamp,
                incidentContext: blockingIncident.incident.context,
            },
        });

        if ("error" in ackResponse) {
            setBlockingActionableMessage(
                ackResponse.error.message ||
                    "Impossible d'enregistrer la confirmation de securite. Reessayez ou contactez l'administrateur."
            );
            setAcknowledgingIncident(false);
            return;
        }

        setBlockingIncident(null);
        setApiError(null);
        setBlockingActionableMessage(
            "Confirmation enregistree. Vous pouvez maintenant corriger le contenu et relancer l'analyse."
        );
        setAcknowledgingIncident(false);
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
            forceReal: isProd ? false : forceReal,
            openaiModel,
        };
        setLastPayload(safePayload);
        await analyze(safePayload);
        setActiveTab("clinical");
    }

    /* ------------------------------------------------------------------ */
    /* Retry                                                             */
    /* ------------------------------------------------------------------ */

    function retry() {
        if (lastPayload) {
            analyze({
                ...lastPayload,
                forceReal,
                openaiModel,
            });
            setActiveTab("clinical");
        }
    }

    const toggleForceReal = () => {
        const next = !forceReal;
        setForceReal(next);
        localStorage.setItem("clinia_force_real", String(next));
        window.dispatchEvent(
            new CustomEvent("clinia:force-real-changed", {
                detail: { forceReal: next },
            })
        );
    };

    /* ------------------------------------------------------------------ */
    /* Render                                                             */
    /* ------------------------------------------------------------------ */

    // Traductions dynamiques
    const { translated: modelLabel, loading: loadingModel, error: errorModel } = useTranslation({ text: "Modèle OpenAI", targetLang, openaiModel });
    const { translated: gptMiniLabel, loading: loadingMini, error: errorMini } = useTranslation({ text: "gpt-4.1-mini (JSON natif)", targetLang, openaiModel });
    const { translated: gptLegacyLabel, loading: loadingLegacy, error: errorLegacy } = useTranslation({ text: "gpt-4-0613 (legacy)", targetLang, openaiModel });
    const { translated: realIaLabel, loading: loadingReal, error: errorReal } = useTranslation({ text: "IA réelle activée", targetLang, openaiModel });
    const { translated: simModeLabel, loading: loadingSim, error: errorSim } = useTranslation({ text: "Mode simulation", targetLang, openaiModel });
    const { translated: backendErrorLabel, loading: loadingBackend, error: errorBackend } = useTranslation({ text: "Erreur backend brute (sans flafla)", targetLang, openaiModel });
    const { translated: loadingLabel } = useTranslation({ text: "Chargement...", targetLang, openaiModel });

        // Affichage loading/erreur pour la traduction dynamique
        const [showTranslationError, setShowTranslationError] = useState<string | null>(null);
        useEffect(() => {
            if (errorModel) setShowTranslationError(errorModel);
            else if (errorMini) setShowTranslationError(errorMini);
            else if (errorLegacy) setShowTranslationError(errorLegacy);
            else if (errorReal) setShowTranslationError(errorReal);
            else if (errorSim) setShowTranslationError(errorSim);
            else if (errorBackend) setShowTranslationError(errorBackend);
            else setShowTranslationError(null);
        }, [errorModel, errorMini, errorLegacy, errorReal, errorSim, errorBackend]);

        const renderLabel = (label: string, loading: boolean, error?: string) => {
            if (loading) return <span style={{ opacity: 0.6 }}>{loadingLabel}</span>;
            return label;
        };

        return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            {showTranslationError && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
                        <h2 className="text-lg font-semibold text-red-700 mb-2">Translation error</h2>
                        <p className="text-sm text-gray-800 mb-4">{showTranslationError}</p>
                        <button className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700" onClick={() => setShowTranslationError(null)}>
                            Close
                        </button>
                    </div>
                </div>
            )}
            {blockingIncident && (
                <SecurityBlockingAlert
                    blocking={blockingIncident}
                    actionableMessage={blockingActionableMessage}
                    acknowledging={acknowledgingIncident}
                    onAcknowledge={handleAcknowledgeBlockingIncident}
                />
            )}

            {/* ❌ Erreur backend brute (sans flafla) */}
            {apiError && (
                <div className="text-red-600 text-sm">
                    {backendErrorLabel}
                </div>
            )}

            {!blockingIncident && blockingActionableMessage && (
                <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    {blockingActionableMessage}
                </div>
            )}

            {/* ⚙️ Sélection modèle */}
            <div className="flex items-center gap-3">
                <label className="text-sm font-medium">
                    {renderLabel(modelLabel, loadingModel, errorModel ?? undefined)}
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
                        {renderLabel(gptMiniLabel, loadingMini, errorMini ?? undefined)}
                    </option>
                    <option value="gpt-4-0613">
                        {renderLabel(gptLegacyLabel, loadingLegacy, errorLegacy ?? undefined)}
                    </option>
                </select>
            </div>

            {/* 🔀 Toggle IA réelle */}
            {!isProd && (
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={toggleForceReal}
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
                                                    ? renderLabel(realIaLabel, loadingReal, errorReal ?? undefined)
                                                    : renderLabel(simModeLabel, loadingSim, errorSim ?? undefined)}
                    </button>
                </div>
            )}

            {/* 👨‍⚕️ Formulaire */}
            {activeTab === "patient" && !result && (
                <ClinicalForm
                    key={targetLang + openaiModel}
                    onSubmit={handleSubmit}
                    loading={loading}
                    initialData={DEFAULT_CLINICAL_PAYLOAD}
                />
            )}

            {/* 📊 Résultat enrichi partagé */}
            {activeTab === "clinical" && (
                <ClinicalDemoResult
                    demoData={{
                        treatments: Array.isArray(result?.treatments) && result.treatments.length > 0
                                ? (result.treatments as any[])
                            : hypertensionTreatments,
                        questions: anticipatedQuestions,
                        summary: result?.patient_summary?.plain_language || undefined,
                    }}
                    sourceMode={serviceMode || undefined}
                    realAI={forceReal}
                />
            )}
        </div>
    );
}
