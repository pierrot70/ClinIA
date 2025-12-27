// src/services/clinicalApi.ts

import type { ClinicalAnalysis } from "../types/clinical";
import type { ApiResponse, ApiSuccess, ApiFailure } from "../types/api";

const API_URL = import.meta.env.VITE_API_URL || "";

/* ------------------------------------------------------------------ */
/* Type guards                                                         */
/* ------------------------------------------------------------------ */

function isApiFailure(obj: any): obj is ApiFailure {
    return (
        typeof obj === "object" &&
        obj !== null &&
        "error" in obj &&
        typeof obj.error?.code === "string"
    );
}

function isApiSuccess<T>(obj: any): obj is ApiSuccess<T> {
    return (
        typeof obj === "object" &&
        obj !== null &&
        "data" in obj &&
        "meta" in obj
    );
}

/* ------------------------------------------------------------------ */
/* API call                                                           */
/* ------------------------------------------------------------------ */

/**
 * Appelle l’API ClinIA.
 *
 * ⚠️ Ne throw jamais pour les erreurs métier
 * ⚠️ Retourne TOUJOURS un ApiResponse<ClinicalAnalysis>
 */
export async function analyzeClinicalCase(
    payload: Record<string, any>
): Promise<ApiResponse<ClinicalAnalysis>> {

    let response: Response;

    /* ---------------- Réseau / fetch ---------------- */
    try {
        response = await fetch(`${API_URL}/api/ai/analyze`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });
    } catch {
        return {
            error: {
                code: "INTERNAL_ERROR",
                message: "Impossible de contacter le serveur ClinIA.",
                retryable: true,
            },
        };
    }

    /* ---------------- JSON parsing ---------------- */
    let json: unknown;

    try {
        json = await response.json();
    } catch {
        return {
            error: {
                code: "INTERNAL_ERROR",
                message: "Réponse serveur invalide.",
                retryable: true,
            },
        };
    }

    /* ---------------- Erreur métier backend ---------------- */
    if (isApiFailure(json)) {
        return json;
    }

    /* ---------------- Succès ---------------- */
    if (isApiSuccess<ClinicalAnalysis>(json)) {
        return json;
    }

    /* ---------------- Cas impossible mais sécurisé ---------------- */
    return {
        error: {
            code: "INTERNAL_ERROR",
            message: "Format de réponse inconnu.",
            retryable: false,
        },
    };
}
