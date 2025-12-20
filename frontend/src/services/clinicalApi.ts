import type { ClinicalAnalysis } from "../types/clinical";

const API_URL = import.meta.env.VITE_API_URL || "";

export async function analyzeClinicalCase(
    payload: Record<string, any>
): Promise<ClinicalAnalysis> {
    const res = await fetch(`${API_URL}/api/ai/analyze`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        throw new Error("CLINICAL_API_ERROR");
    }

    const data = await res.json();

    // Ici : le backend garantit déjà la validité du JSON
    return data as ClinicalAnalysis;
}
