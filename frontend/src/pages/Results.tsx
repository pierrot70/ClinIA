import React, { useEffect, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import {
    hypertensionTreatments,
    anticipatedQuestions,
} from "../data/hypertension";
import TreatmentCard from "../components/TreatmentCard";
import ChartCard from "../components/ChartCard";
import QuestionCard from "../components/QuestionCard";
import AICard from "../components/AICard";
import { parseAIResponse } from "../utils/aiParser";
import AITreatmentTable from "../components/AITreatmentTable";

// 🌟 Extraction automatique tableau clinique
function extractTreatmentRows(text: string) {
    const rows: any[] = [];

    const blocks = text
        .split(/\n\s*\n/) // paragraphes
        .map((b) => b.trim())
        .filter((b) => b.length > 0);

    for (const block of blocks) {
        const nameMatch =
            block.match(/^[-•]?\s*([A-Za-zéèêàïîôç \(\)\/0-9]+)/);

        if (!nameMatch) continue;

        const name = nameMatch[1];

        const justification = block.includes("Justification")
            ? block.split("Justification")[1].split("Contre")[0].trim()
            : "";

        const contraindications = block.includes("Contre-indications")
            ? block.split("Contre-indications")[1].trim()
            : "";

        if (name && (justification || contraindications)) {
            rows.push({
                name,
                justification: justification || "-",
                contraindications: contraindications || "-",
            });
        }
    }

    return rows;
}

const useQuery = () => {
    return new URLSearchParams(useLocation().search);
};

const Results: React.FC = () => {
    const query = useQuery();
    const q =
        query.get("q") || "Hypertension essentielle grade 1";

    const top = hypertensionTreatments[0];

    // 🌟 États IA
    const [aiResponse, setAiResponse] = useState<string | null>(null);
    const [parsedAI, setParsedAI] = useState<any>(null);
    const [tableRows, setTableRows] = useState<any[]>([]);
    const [loadingAI, setLoadingAI] = useState(true);
    const [aiError, setAiError] = useState(false);

    const API_URL =
        import.meta.env.VITE_API_URL || "http://localhost:4000";

    // 🌟 Appel IA
    useEffect(() => {
        const fetchAI = async () => {
            try {
                const res = await fetch(`${API_URL}/api/ai/analyze`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        diagnosis: q,
                        patient: { age: 55, bp: "140/90", simulated: true },
                    }),
                });

                const json = await res.json();
                const raw = json.analysis || "Aucune analyse reçue.";

                setAiResponse(raw);

                // Extraction sections IA
                const structured = parseAIResponse(raw);
                setParsedAI(structured);

                // Extraction tableau clinique
                const table = extractTreatmentRows(raw);
                setTableRows(table);
            } catch (err) {
                console.error("Erreur IA:", err);
                setAiError(true);
            } finally {
                setLoadingAI(false);
            }
        };

        fetchAI();
    }, [q, API_URL]);

    return (
        <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
            {/* ------------------------------ HEADER ------------------------------ */}
            <header className="space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                    Diagnostic saisi
                </p>
                <h1 className="text-2xl font-semibold text-gray-900">{q}</h1>
                <p className="text-sm text-gray-600 max-w-2xl">
                    Résumé généré à partir de données simulées pour démontrer la manière
                    dont ClinIA pourrait guider les décisions thérapeutiques.
                </p>
            </header>

            {/* ------------------------------ ANALYSE IA + TABLEAU ------------------------------ */}
            <section className="space-y-4">
                <AICard
                    loading={loadingAI}
                    error={aiError}
                    text={aiResponse}
                />

                {/* Sections IA */}
                {parsedAI && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-6">
                        {/* Options thérapeutiques */}
                        {parsedAI.options.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold text-gray-800 mb-2">
                                    🩺 Options thérapeutiques
                                </h3>
                                <ul className="list-disc ml-6 text-sm text-gray-700 space-y-1">
                                    {parsedAI.options.map((o: string, i: number) => (
                                        <li key={i}>{o}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Contre-indications */}
                        {parsedAI.contraindications.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold text-gray-800 mb-2">
                                    ⚠️ Contre-indications
                                </h3>
                                <ul className="list-disc ml-6 text-sm text-gray-700 space-y-1">
                                    {parsedAI.contraindications.map(
                                        (c: string, i: number) => (
                                            <li key={i}>{c}</li>
                                        )
                                    )}
                                </ul>
                            </div>
                        )}

                        {/* Résumé patient */}
                        {parsedAI.summary.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold text-gray-800 mb-2">
                                    🧍 Résumé patient
                                </h3>
                                <p className="text-sm text-gray-700 leading-relaxed">
                                    {parsedAI.summary.join(" ")}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* 🌟 Tableau clinique généré automatiquement */}
                {tableRows.length > 0 && (
                    <AITreatmentTable rows={tableRows} />
                )}
            </section>

            {/* ------------------------------ TRAITEMENT SUGGÉRÉ ------------------------------ */}
            <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-start">
                <div>
                    <h2 className="text-sm font-semibold text-gray-800 mb-1">
                        Traitement suggéré (simulation)
                    </h2>
                    <p className="text-sm text-gray-700">
                        Pour ce scénario,{" "}
                        <span className="font-semibold">{top.name}</span>{" "}
                        est proposé comme agent de première ligne.
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                        Contenu fictif à des fins de démonstration.
                    </p>
                </div>
                <div className="text-right text-sm">
                    <div className="text-xs text-gray-500">
                        Efficacité simulée
                    </div>
                    <div className="text-3xl font-semibold text-primary">
                        {Math.round(top.efficacy * 100)}%
                    </div>
                    <Link
                        to="/quick"
                        className="mt-2 inline-block text-xs text-primary hover:underline"
                    >
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
                <h2 className="text-sm font-semibold text-gray-800">
                    Questions fréquentes (simulation)
                </h2>
                <p className="text-xs text-gray-500">
                    Ces réponses sont simulées pour illustrer la manière dont ClinIA
                    pourrait anticiper les interrogations d’un clinicien.
                </p>

                <div className="space-y-2">
                    {anticipatedQuestions.map((qa) => (
                        <QuestionCard
                            key={qa.question}
                            question={qa.question}
                            answer={qa.answer}
                        />
                    ))}
                </div>
            </section>
        </div>
    );
};

export default Results;
