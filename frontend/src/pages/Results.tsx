import React, { useEffect, useMemo, useState } from "react";
import { useLocation, Link } from "react-router-dom";

import { hypertensionTreatments, anticipatedQuestions } from "../data/hypertension";

import TreatmentCard from "../components/TreatmentCard";
import ChartCard from "../components/ChartCard";
import QuestionCard from "../components/QuestionCard";
import AICard from "../components/AICard";
import AITreatmentTable from "../components/AITreatmentTable";

const useQuery = () => new URLSearchParams(useLocation().search);

const Results: React.FC = () => {
    const query = useQuery();
    const q = query.get("q") || "Hypertension essentielle grade 1";

    const top = hypertensionTreatments[0];

    // 🌟 États IA
    const [analysis, setAnalysis] = useState<any>(null);
    const [loadingAI, setLoadingAI] = useState(true);
    const [aiError, setAiError] = useState(false);

    // ✅ IMPORTANT: same-origin pour que ça marche en prod (Coolify/DO) et en local (avec proxy Vite)
    const AI_ENDPOINT = "/api/ai/analyze";

    // 🔁 Toggle: IA réelle (forceReal=true)
    const [realAI, setRealAI] = useState(false);

    // (optionnel) Empêche de spammer le backend si tu recliques trop vite
    const canToggle = useMemo(() => !loadingAI, [loadingAI]);

    // 🌟 Appel IA
    useEffect(() => {
        const fetchAI = async () => {
            setLoadingAI(true);
            setAiError(false);

            try {
                const res = await fetch(AI_ENDPOINT, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        diagnosis: q,
                        patient: { age: 55, bp: "140/90", simulated: true },
                        // ✅ Le backend doit respecter ce flag (forceReal)
                        forceReal: realAI,
                    }),
                });

                const json = await res.json().catch(() => ({}));

                if (!res.ok) {
                    console.error("Erreur API analyze:", res.status, json);
                    setAiError(true);
                    setAnalysis({ patient_summary: "", treatments: [] });
                    return;
                }

                if (!json || !json.analysis) {
                    setAiError(true);
                    setAnalysis({ patient_summary: "", treatments: [] });
                    return;
                }

                setAnalysis(json.analysis);
            } catch (err) {
                console.error("Erreur IA:", err);
                setAiError(true);
                setAnalysis({ patient_summary: "", treatments: [] });
            } finally {
                setLoadingAI(false);
            }
        };

        fetchAI();
    }, [q, realAI]);

    return (
        <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
            {/* ------------------------------ HEADER ------------------------------ */}
            <header className="space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Diagnostic saisi</p>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <h1 className="text-2xl font-semibold text-gray-900">{q}</h1>

                    {/* ✅ Bouton IA réelle */}
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={!canToggle}
                            onClick={() => setRealAI((v) => !v)}
                            className={`px-3 py-2 rounded-lg text-xs font-medium border transition disabled:opacity-50 ${
                                realAI
                                    ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                            }`}
                            title="Force une requête réelle (OpenAI) au lieu du mock"
                        >
                            {realAI ? "IA réelle: ON" : "IA réelle: OFF"}
                        </button>

                        <span className="text-[11px] text-gray-500">
              {realAI ? "Requête OpenAI" : "Réponse mock"}
            </span>
                    </div>
                </div>

                <p className="text-sm text-gray-600 max-w-2xl">
                    Résumé généré à partir d’une analyse simulée pour illustrer la manière dont ClinIA
                    pourrait aider à guider les décisions thérapeutiques.
                </p>

                {realAI && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 max-w-2xl">
                        ⚠️ IA réelle activée : ceci peut consommer des crédits OpenAI.
                    </p>
                )}
            </header>

            {/* ------------------------------ ANALYSE IA ------------------------------ */}
            <section className="space-y-4">
                <AICard loading={loadingAI} error={aiError} text={analysis?.patient_summary} />

                {/* Tableau structuré ClinIA */}
                {analysis?.treatments && analysis.treatments.length > 0 && (
                    <AITreatmentTable treatments={analysis.treatments} />
                )}
            </section>

            {/* ------------------------------ TRAITEMENT SUGGÉRÉ ------------------------------ */}
            <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-start">
                <div>
                    <h2 className="text-sm font-semibold text-gray-800 mb-1">
                        Traitement suggéré (simulation)
                    </h2>
                    <p className="text-sm text-gray-700">
                        Pour ce scénario, <span className="font-semibold">{top.name}</span>{" "}
                        est proposé comme agent de première ligne.
                    </p>
                    <p className="text-xs text-gray-500 mt-2">Contenu fictif à des fins de démonstration.</p>
                </div>
                <div className="text-right text-sm">
                    <div className="text-xs text-gray-500">Efficacité simulée</div>
                    <div className="text-3xl font-semibold text-primary">{Math.round(top.efficacy * 100)}%</div>
                    <Link to="/quick" className="mt-2 inline-block text-xs text-primary hover:underline">
                        Voir le mode résumé →
                    </Link>
                </div>
            </section>

            {/* ------------------------------ LISTE TRAITEMENTS ------------------------------ */}
            <section className="grid md:grid-cols-3 gap-4">
                {hypertensionTreatments.map((t) => (
                    <TreatmentCard key={t.id} treatment={t} />
                ))}
            </section>

            {/* ------------------------------ GRAPHIQUE ------------------------------ */}
            <section>
                <ChartCard treatments={hypertensionTreatments} />
            </section>

            {/* ------------------------------ QUESTIONS ------------------------------ */}
            <section className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-800">Questions fréquentes (simulation)</h2>
                <p className="text-xs text-gray-500">
                    Ces réponses sont simulées pour illustrer la manière dont ClinIA pourrait anticiper les
                    interrogations d’un clinicien.
                </p>

                <div className="space-y-2">
                    {anticipatedQuestions.map((qa) => (
                        <QuestionCard key={qa.question} question={qa.question} answer={qa.answer} />
                    ))}
                </div>
            </section>
        </div>
    );
};

export default Results;
