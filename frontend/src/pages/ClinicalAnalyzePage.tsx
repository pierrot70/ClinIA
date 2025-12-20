import { useState } from "react";
import { analyzeClinicalCase } from "../services/clinicalApi";
import { ClinicalResultPage } from "./ClinicalResultPage";
import type { ClinicalAnalysis } from "../types/clinical";

export function ClinicalAnalyzePage() {
    const [result, setResult] = useState<ClinicalAnalysis | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleAnalyze() {
        setLoading(true);
        setError(null);

        try {
            const payload = {
                age: 55,
                sex: "male",
                symptoms: ["polyurie", "polydipsie"],
                medical_history: ["hypertension"],
                current_medications: ["amlodipine"],
            };

            const data = await analyzeClinicalCase(payload);
            setResult(data);
        } catch (err) {
            setError("Impossible d’obtenir une analyse clinique fiable.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-gray-100 p-6">
            {!result && (
                <div className="max-w-xl mx-auto bg-white p-6 rounded border">
                    <h1 className="text-lg font-semibold mb-4">
                        Analyse clinique assistée
                    </h1>

                    <button
                        onClick={handleAnalyze}
                        disabled={loading}
                        className="w-full bg-blue-600 text-white py-2 rounded disabled:opacity-50"
                    >
                        {loading ? "Analyse en cours…" : "Lancer l’analyse"}
                    </button>

                    {error && (
                        <p className="mt-3 text-sm text-red-600">{error}</p>
                    )}
                </div>
            )}

            {result && <ClinicalResultPage data={result} />}
        </div>
    );
}
