import React, { useEffect, useMemo, useRef, useState } from "react";
import { useClinicalAnalysis } from "../hooks/useClinicalAnalysis";
import { useLocation, Link } from "react-router-dom";
import { useHomeI18n } from "../contexts/HomeI18nContext";
import {
    acknowledgeSecurityIncident,
    REQUIRED_ACK_ACTION,
} from "../services/securityIncidentApi";
import { SecurityBlockingAlert } from "../components/system/SecurityBlockingAlert";
import type { SecurityIncidentBlockingData } from "../types/api";
import type { ClinicalPayload } from "../types/clinical";

import AICard from "../components/AICard";
import ClinicalDemoResult from "../components/ClinicalDemoResult";

import { getClinicalDemoScenario } from "../data/clinicalDemoScenarios";

const useQuery = () => new URLSearchParams(useLocation().search);
const RESULTS_PAYLOAD_STORAGE_KEY = "clinia_results_payload";

type ResultsLocationState = {
    patientDisplayName?: string;
    analysisPayload?: ClinicalPayload;
};

function buildFallbackPayload(q: string): ClinicalPayload {
    return {
        age: 55,
        sex: "male",
        symptoms: [q],
        medical_history: [],
        current_medications: [],
    };
}

const Results: React.FC = () => {
    const { locale } = useHomeI18n();
    const isProd = !!import.meta.env.PROD;
    const location = useLocation();
    const query = useQuery();
    const q = query.get("q") || "Hypertension essentielle";
    const locationState = location.state as ResultsLocationState | null;
    const patientDisplayName =
        locationState?.patientDisplayName?.trim() ||
        undefined;
    const baseAnalysisPayload = useMemo(() => {
        if (locationState?.analysisPayload) {
            return {
                ...locationState.analysisPayload,
                symptoms:
                    Array.isArray(locationState.analysisPayload.symptoms) &&
                    locationState.analysisPayload.symptoms.length > 0
                        ? locationState.analysisPayload.symptoms
                        : [q],
            } satisfies ClinicalPayload;
        }

        if (typeof window !== "undefined") {
            try {
                const raw = window.sessionStorage.getItem(
                    RESULTS_PAYLOAD_STORAGE_KEY
                );
                if (raw) {
                    const parsed = JSON.parse(raw) as {
                        q?: string;
                        payload?: ClinicalPayload;
                    };
                    if (parsed.q === q && parsed.payload) {
                        return parsed.payload;
                    }
                }
            } catch (error) {}
        }

        return buildFallbackPayload(q);
    }, [locationState, q]);

    const { result: analysis, loading: loadingAI, error: errorMessage, analyze } = useClinicalAnalysis();

    const demoScenario = getClinicalDemoScenario(baseAnalysisPayload);

    const demoData = {
        treatments:
            Array.isArray(analysis?.treatments) && analysis.treatments.length > 0
                ? analysis.treatments
                : demoScenario.treatments,
        questions: demoScenario.questions,
        summary: analysis?.patient_summary?.plain_language || undefined,
        error: errorMessage || undefined,
        clinical_summary: analysis?.clinical_summary,
        recommendations: analysis?.recommendations,
        initial_evaluation_recommendations: analysis?.initial_evaluation_recommendations,
        treatment_options: analysis?.treatment_options,
        follow_up_and_monitoring: analysis?.follow_up_and_monitoring,
        other_ai_fields: analysis?.other_ai_fields,
    };
    const [sourceMode, setSourceMode] = useState<
        "mock" | "real" | "degraded" | "unknown"
    >("unknown");
    const [blockingIncident, setBlockingIncident] =
        useState<SecurityIncidentBlockingData | null>(null);
    const [acknowledgingIncident, setAcknowledgingIncident] = useState(false);
    const [blockingActionableMessage, setBlockingActionableMessage] =
        useState<string | null>(null);
    const [neutralizedMessage, setNeutralizedMessage] = useState<string | null>(null);

    const [realAI, setRealAI] = useState(() => {
        if (typeof window === "undefined") {
            return false;
        }
        return localStorage.getItem("clinia_force_real") === "true";
    });
    const realAIRef = useRef(realAI);
    const canToggle = useMemo(() => !loadingAI, [loadingAI]);
    const requestIdRef = useRef(0);

    const AI_ENDPOINT = "/api/ai/analyze";

    // fetchAI remplacé par useClinicalAnalysis

    useEffect(() => {
        if (isProd) {
            localStorage.removeItem("clinia_force_real");
            setRealAI(false);
            realAIRef.current = false;
            return;
        }
        const stored = localStorage.getItem("clinia_force_real");
        const next = stored === "true";
        setRealAI((prev) => (prev === next ? prev : next));
        realAIRef.current = next;

        const handleForceRealChange = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (detail && typeof detail.forceReal === "boolean") {
                setRealAI(detail.forceReal);
                realAIRef.current = detail.forceReal;
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

    useEffect(() => {
        analyze({
            ...baseAnalysisPayload,
            forceReal: realAIRef.current,
        });
    }, [analyze, baseAnalysisPayload]);

    async function handleAcknowledgeBlockingIncident() {
        if (!blockingIncident) {
            return;
        }

        setAcknowledgingIncident(true);
        setBlockingActionableMessage(null);

        const ackResponse = await acknowledgeSecurityIncident({
            incidentId: blockingIncident.incident.id,
            action: REQUIRED_ACK_ACTION,
            context: {
                route: "/results",
                flow: "quick_search",
                query: q,
            },
        });

        if ("error" in ackResponse) {
            setBlockingActionableMessage(
                ackResponse.error.message ||
                    "Impossible d'enregistrer l'acknowledgment de securite."
            );
            setAcknowledgingIncident(false);
            return;
        }

        setBlockingIncident(null);
        setAcknowledgingIncident(false);
        // Relancer l'analyse après acknowledge
        analyze({
            ...baseAnalysisPayload,
            forceReal: realAIRef.current,
        });
    }

    return (
        <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
            {blockingIncident && (
                <SecurityBlockingAlert
                    blocking={blockingIncident}
                    actionableMessage={blockingActionableMessage}
                    acknowledging={acknowledgingIncident}
                    onAcknowledge={handleAcknowledgeBlockingIncident}
                />
            )}

            {/* HEADER */}
            <header className="space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                    {locale === "en" ? "Search Term" : "Terme recherché"}
                </p>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <h1 className="text-2xl font-semibold text-gray-900">{q}</h1>
                    {!isProd && (
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled={!canToggle}
                                onClick={() => {
                                    const next = !realAI;
                                    setRealAI(next);
                                    localStorage.setItem(
                                        "clinia_force_real",
                                        String(next)
                                    );
                                    window.dispatchEvent(
                                        new CustomEvent(
                                            "clinia:force-real-changed",
                                            {
                                                detail: { forceReal: next },
                                            }
                                        )
                                    );
                                }}
                                className={`px-3 py-2 rounded-lg text-xs font-medium border transition disabled:opacity-50 ${
                                    realAI
                                        ? "bg-emerald-600 text-white border-emerald-600"
                                        : "bg-white text-gray-700 border-gray-200"
                                }`}
                            >
                                {realAI ? "IA réelle: ON" : "IA réelle: OFF"}
                            </button>
                        </div>
                    )}
                </div>
                <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-2 max-w-2xl">
                    Source: {sourceMode}
                </p>
                {neutralizedMessage && (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 max-w-2xl">
                        {neutralizedMessage}
                    </p>
                )}
                {!isProd && realAI && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 max-w-2xl">
                        ⚠️ IA réelle activée — consommation de crédits OpenAI.
                    </p>
                )}
            </header>

            {/* ANALYSE IA */}
            <section className="space-y-4">
                <AICard
                    loading={loadingAI}
                    error={!!errorMessage}
                    text={errorMessage ?? analysis?.patient_summary?.plain_language}
                />
            </section>

            {/* Rendu enrichi partagé */}
            <ClinicalDemoResult
                demoData={demoData as any}
                sourceMode={sourceMode}
                realAI={realAI}
                patientDisplayName={patientDisplayName}
            />
        </div>
    );
};

export default Results;
