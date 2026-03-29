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

import AICard from "../components/AICard";
import AITreatmentTable from "../components/AITreatmentTable";
import TreatmentCard from "../components/TreatmentCard";
import ChartCard from "../components/ChartCard";
import QuestionCard from "../components/QuestionCard";

import { hypertensionTreatments, anticipatedQuestions } from "../data/hypertension";

const useQuery = () => new URLSearchParams(useLocation().search);

const Results: React.FC = () => {
    const { locale } = useHomeI18n();
    const isProd = !!import.meta.env.PROD;
    const query = useQuery();
    const q = query.get("q") || "Hypertension essentielle";

    const top = hypertensionTreatments[0];

    const { result: analysis, loading: loadingAI, error: errorMessage, analyze } = useClinicalAnalysis();
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
            age: 55,
            sex: "male",
            symptoms: [q],
            medical_history: [],
            current_medications: [],
            forceReal: realAIRef.current,
        });
    }, [q]);

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
            age: 55,
            sex: "male",
            symptoms: [q],
            medical_history: [],
            current_medications: [],
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
                {!isProd && realAI && loadingAI && (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-6">
                        <div className="h-14 w-14 animate-spin rounded-full border-4 border-gray-200 border-t-primary" />
                        <div className="text-sm text-gray-700">
                            Requete OpenAI en cours...
                        </div>
                    </div>
                )}
                <AICard
                    loading={loadingAI}
                    error={!!errorMessage}
                    text={errorMessage ?? analysis?.patient_summary?.plain_language}
                />

                {Array.isArray(analysis?.treatments) && analysis.treatments.length > 0 && (
                    <AITreatmentTable treatments={analysis.treatments.map(t => ({
                        name: t.name,
                        justification: t.indication || "-",
                        contraindications: t.contraindications || [],
                        efficacy: 0 // Champ non fourni par l'API IA, valeur neutre
                    }))} />
                )}
            </section>

            {/* CONTENU DEMO */}
            <section className="bg-white border rounded-xl p-4 shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-start">
                <div>
                    <h2 className="text-sm font-semibold text-gray-800 mb-1">
                        Traitement suggéré (simulation)
                    </h2>
                    <p className="text-sm text-gray-700">
                        <span className="font-semibold">{top.name}</span> est proposé comme
                        agent de première ligne.
                    </p>
                </div>
                <div className="text-right text-sm">
                    <div className="text-xs text-gray-500">Efficacité simulée</div>
                    <div className="text-3xl font-semibold text-primary">
                        {Math.round(top.efficacy * 100)}%
                    </div>
                    <Link to="/quick" className="mt-2 inline-block text-xs text-primary hover:underline">
                        Voir le mode résumé →
                    </Link>
                </div>
            </section>

            <section className="grid md:grid-cols-3 gap-4">
                {hypertensionTreatments.map(t => (
                    <TreatmentCard key={t.id} treatment={t} />
                ))}
            </section>

            <section>
                <ChartCard treatments={hypertensionTreatments} />
            </section>

            <section className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-800">
                    Questions fréquentes (simulation)
                </h2>
                <div className="space-y-2">
                    {anticipatedQuestions.map(qa => (
                        <QuestionCard key={qa.question} {...qa} />
                    ))}
                </div>
            </section>
        </div>
    );
};

export default Results;
