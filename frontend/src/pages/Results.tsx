import React, { useEffect, useMemo, useState } from "react";
import { useLocation, Link } from "react-router-dom";

import AICard from "../components/AICard";
import AITreatmentTable from "../components/AITreatmentTable";
import TreatmentCard from "../components/TreatmentCard";
import ChartCard from "../components/ChartCard";
import QuestionCard from "../components/QuestionCard";

import { hypertensionTreatments, anticipatedQuestions } from "../data/hypertension";

const useQuery = () => new URLSearchParams(useLocation().search);

const Results: React.FC = () => {
    const query = useQuery();
    const q = query.get("q") || "Hypertension essentielle";

    const top = hypertensionTreatments[0];

    const [analysis, setAnalysis] = useState<any>(null);
    const [loadingAI, setLoadingAI] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const [realAI, setRealAI] = useState(false);
    const canToggle = useMemo(() => !loadingAI, [loadingAI]);

    const AI_ENDPOINT = "/api/ai/analyze";

    useEffect(() => {
        const fetchAI = async () => {
            setLoadingAI(true);
            setErrorMessage(null);
            setAnalysis(null);

            try {
                const res = await fetch(AI_ENDPOINT, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        // ✅ CONTRAT BACKEND RESPECTÉ
                        age: 55,
                        sex: "male",
                        symptoms: [q],                 // ← 🔑 LA CLE
                        medical_history: [],
                        current_medications: [],
                        forceReal: realAI,
                    }),
                });

                const json = await res.json();

                if (json?.error) {
                    setErrorMessage(json.error.message || "Erreur lors de l’analyse.");
                    return;
                }

                setAnalysis(json);
            } catch (err) {
                console.error("Erreur IA:", err);
                setErrorMessage("Erreur réseau ou serveur.");
            } finally {
                setLoadingAI(false);
            }
        };

        fetchAI();
    }, [q, realAI]);

    return (
        <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">

            {/* HEADER */}
            <header className="space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                    Terme recherché
                </p>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <h1 className="text-2xl font-semibold text-gray-900">{q}</h1>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={!canToggle}
                            onClick={() => setRealAI(v => !v)}
                            className={`px-3 py-2 rounded-lg text-xs font-medium border transition disabled:opacity-50 ${
                                realAI
                                    ? "bg-emerald-600 text-white border-emerald-600"
                                    : "bg-white text-gray-700 border-gray-200"
                            }`}
                        >
                            {realAI ? "IA réelle: ON" : "IA réelle: OFF"}
                        </button>
                    </div>
                </div>

                {realAI && (
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

                {analysis?.treatments?.length > 0 && (
                    <AITreatmentTable treatments={analysis.treatments} />
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
