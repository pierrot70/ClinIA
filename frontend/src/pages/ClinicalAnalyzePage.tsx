import { useState } from "react";
import { ClinicalForm } from "../components/clinical/ClinicalForm";
import { ClinicalResultPage } from "./ClinicalResultPage";
import { analyzeClinicalCase } from "../services/clinicalApi";

function emptyArray(arr?: string[]) {
    return !arr || arr.length === 0;
}

export function ClinicalAnalyzePage() {
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [warning, setWarning] = useState<string>();
    const [highlightFields, setHighlightFields] = useState<string[]>([]);

    function computeMissingFields(payload: any): string[] {
        const missing: string[] = [];

        if (payload.weight == null) missing.push("weight");
        if (payload.height == null) missing.push("height");
        if (emptyArray(payload.symptoms)) missing.push("symptoms");
        if (emptyArray(payload.medical_history))
            missing.push("medical_history");
        if (emptyArray(payload.current_medications))
            missing.push("current_medications");

        return missing;
    }

    async function handleSubmit(payload: any) {
        setLoading(true);
        setWarning(undefined);
        setHighlightFields([]);

        const missing = computeMissingFields(payload);

        // ✅ VALIDATION AVANT APPEL API
        if (missing.length > 0) {
            setWarning(
                "Veuillez compléter les champs requis pour une analyse fiable."
            );
            setHighlightFields(missing);
            setLoading(false);
            return;
        }

        try {
            const data = await analyzeClinicalCase(payload);
            setResult(data);
        } catch {
            setWarning("Erreur technique. Veuillez réessayer.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6">
            {!result && (
                <ClinicalForm
                    onSubmit={handleSubmit}
                    loading={loading}
                    warningMessage={warning}
                    highlightFields={highlightFields}
                />
            )}

            {result && <ClinicalResultPage data={result} />}
        </div>
    );
}
