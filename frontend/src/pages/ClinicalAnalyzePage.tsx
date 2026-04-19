import { useEffect, useState, useContext } from "react";
import { Link } from "react-router-dom";
import {
    lookupClinicianReplies,
    type ClinicianComment,
} from "../services/clinicianCommentsApi";
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
import { getClinicalDemoScenario } from "../data/clinicalDemoScenarios";
import { HomeI18nContext } from "../contexts/HomeI18nContext";

import type { ClinicalPayload } from "../types/clinical";
import type {
    ApiResponse,
    ApiError,
    SecurityIncidentBlockingData,
} from "../types/api";

type OpenAIModel = "gpt-4.1-mini" | "gpt-4-0613";

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function ClinicalAnalyzePage() {
    const COMMENT_TRACKING_STORAGE_KEY = "clinia_comment_tracking";
    const i18n = useContext(HomeI18nContext) || { locale: "fr" };
    const targetLang = i18n.locale;
    const [openaiModel, setOpenaiModel] = useState<OpenAIModel>("gpt-4.1-mini");
    const isProd = !!import.meta.env.PROD;
    const [activeTab, setActiveTab] =
        useState<"patient" | "clinical">("patient");

    const { result, loading, error, errorCode, analyze, resetAnalysis } = useClinicalAnalysis();

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
    const [replyLookupName, setReplyLookupName] = useState("");
    const [replyLookupCode, setReplyLookupCode] = useState("");
    const [replyLookupLoading, setReplyLookupLoading] = useState(false);
    const [replyLookupError, setReplyLookupError] = useState("");
    const [replyLookupItems, setReplyLookupItems] = useState<ClinicianComment[]>([]);
    const demoScenario = getClinicalDemoScenario(lastPayload);

    /* ------------------------------------------------------------------ */
    /* Nettoyage cache à l’entrée (1 seule fois)                          */
    /* ------------------------------------------------------------------ */

    useEffect(() => {
        localStorage.removeItem("clinia_last_clinical_payload");
    }, []);
    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(COMMENT_TRACKING_STORAGE_KEY);
            if (!raw) {
                return;
            }
            const parsed = JSON.parse(raw) as {
                guestDisplayName?: string;
                trackingCode?: string;
            };
            if (parsed.guestDisplayName) {
                setReplyLookupName(parsed.guestDisplayName);
            }
            if (parsed.trackingCode) {
                setReplyLookupCode(parsed.trackingCode);
            }
        } catch {
            // Ignore local storage errors.
        }
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
            forceReal: isProd ? false : forceReal,
            openaiModel,
        };
        setLastPayload(safePayload);
        setActiveTab("clinical");
        await analyze(safePayload);
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

    function handleBackToClinicalDemo() {
        resetAnalysis();
        setApiError(null);
        setBlockingIncident(null);
        setBlockingActionableMessage(null);
        setServiceMode(null);
        setActiveTab("patient");
    }

    async function handleLookupReplies(event: React.FormEvent) {
        event.preventDefault();
        setReplyLookupLoading(true);
        setReplyLookupError("");

        const response = await lookupClinicianReplies(replyLookupName, replyLookupCode);
        setReplyLookupLoading(false);

        if (!response.ok) {
            setReplyLookupItems([]);
            setReplyLookupError(response.error.message);
            return;
        }

        setReplyLookupItems(response.data.items || []);
        if ((response.data.items || []).length === 0) {
            setReplyLookupError("Aucune reponse trouvee pour ces informations de suivi.");
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

            <div className="flex justify-end">
                <Link
                    to="/comments"
                    className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-800 transition hover:bg-sky-100"
                >
                    Laisser un commentaire
                </Link>
            </div>

            <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                <div className="mb-3">
                    <h2 className="text-lg font-semibold text-amber-950">
                        Voir les reponses a mes commentaires
                    </h2>
                    <p className="mt-1 text-sm text-amber-900">
                        Entrez exactement le nom ou pseudonyme utilise lors du commentaire,
                        ainsi que votre code de suivi. Si votre navigateur a conserve ces
                        informations, elles sont pre-remplies automatiquement.
                    </p>
                </div>
                <form onSubmit={handleLookupReplies} className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
                    <input
                        className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                        placeholder="Nom ou pseudonyme"
                        value={replyLookupName}
                        onChange={(event) => setReplyLookupName(event.target.value)}
                    />
                    <input
                        className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm uppercase outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                        placeholder="Code de suivi"
                        value={replyLookupCode}
                        onChange={(event) => setReplyLookupCode(event.target.value.toUpperCase())}
                        maxLength={8}
                    />
                    <button
                        type="submit"
                        disabled={replyLookupLoading}
                        className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {replyLookupLoading ? "Recherche..." : "Voir mes reponses"}
                    </button>
                </form>
                {replyLookupError && (
                    <div className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-sm text-amber-900">
                        {replyLookupError}
                    </div>
                )}
                {replyLookupItems.length > 0 && (
                    <div className="mt-4 space-y-3">
                        {replyLookupItems.map((item) => (
                            <article key={item.id} className="rounded-lg border border-amber-100 bg-white p-4">
                                <div className="mb-2 text-xs text-gray-500">
                                    Commentaire du {new Date(item.createdAt).toLocaleString("fr-CA")}
                                </div>
                                <p className="whitespace-pre-wrap text-sm text-gray-800">
                                    {item.comment}
                                </p>
                                <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
                                    {item.replies.map((reply) => (
                                        <div key={reply.id} className="rounded-lg bg-amber-50 p-3">
                                            <div className="mb-1 text-xs text-gray-500">
                                                Reponse de {reply.responderUsername} le{" "}
                                                {new Date(reply.createdAt).toLocaleString("fr-CA")}
                                            </div>
                                            <p className="whitespace-pre-wrap text-sm text-gray-800">
                                                {reply.message}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>

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
                />
            )}

            {/* 📊 Résultat enrichi partagé */}
            {activeTab === "clinical" && loading && (
                <div className="space-y-4">
                    <div className="flex justify-start">
                        <button
                            type="button"
                            onClick={handleBackToClinicalDemo}
                            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                        >
                            Retour a /clinical-demo
                        </button>
                    </div>
                    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-lime-200 bg-lime-50/80 p-10 text-center">
                        <div className="clinia-neon-loader" aria-hidden="true" />
                        <div className="clinia-neon-text text-sm font-semibold uppercase tracking-[0.2em]">
                            Requete OpenAI en cours...
                        </div>
                    </div>
                </div>
            )}

            {activeTab === "clinical" && !loading && (
                <div className="space-y-4">
                    <div className="flex justify-start">
                        <button
                            type="button"
                            onClick={handleBackToClinicalDemo}
                            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                        >
                            Retour a /clinical-demo
                        </button>
                    </div>
                    <ClinicalDemoResult
                        demoData={{
                            treatments:
                                Array.isArray(result?.treatments) && result.treatments.length > 0
                                    ? (result.treatments as any[])
                                    : demoScenario.treatments,
                            questions: demoScenario.questions,
                            summary: result?.patient_summary?.plain_language || undefined,
                            error: error || undefined,
                            errorCode: errorCode || undefined,
                            clinical_summary: result?.clinical_summary,
                            recommendations: result?.recommendations,
                            initial_evaluation_recommendations:
                                result?.initial_evaluation_recommendations,
                            treatment_options: result?.treatment_options,
                            follow_up_and_monitoring: result?.follow_up_and_monitoring,
                            other_ai_fields: result?.other_ai_fields,
                        }}
                        sourceMode={serviceMode || undefined}
                        realAI={forceReal}
                    />
                </div>
            )}
        </div>
    );
}
