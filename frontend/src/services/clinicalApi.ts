// src/services/clinicalApi.ts

import type { ClinicalAnalysis } from "../types/clinical";
import type { ApiResponse } from "../types/api";


const API_URL = import.meta.env.VITE_API_URL || "";

/**
 * Appelle l’API ClinIA.
 *
 * ⚠️ Ne throw jamais pour les erreurs métier (OpenAI / Mongo).
 * ⚠️ Retourne TOUJOURS un ApiResponse<ClinicalAnalysis>.
 */
export async function analyzeClinicalCase(
    payload: Record<string, any>
): Promise<ApiResponse<ClinicalAnalysis>> {
    let response: Response;

    // 🌐 Erreurs réseau (serveur down, CORS, offline)
    try {
        response = await fetch(`${API_URL}/api/ai/analyze`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });
    } catch (err) {
        return {
            error: {
                source: "internal",
                message: "Impossible de contacter le serveur ClinIA.",
                technical: String(err),
            },
        };
    }

    let json: unknown;

    // 🧩 JSON invalide
    try {
        json = await response.json();
    } catch (err) {
        return {
            error: {
                source: "internal",
                message: "Réponse serveur invalide (JSON non lisible).",
                technical: String(err),
            },
        };
    }

    // ❌ Erreur métier retournée par le backend
    if (
        typeof json === "object" &&
        json !== null &&
        "error" in json
    ) {
        return json as ApiResponse<ClinicalAnalysis>;
    }

    // ✅ Succès
    return {
        data: json as ClinicalAnalysis,
    };
}
