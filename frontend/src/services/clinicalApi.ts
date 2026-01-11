// src/services/clinicalApi.ts

import type { ClinicalAnalysis, ClinicalPayload } from "../types/clinical";
import type { ApiResponse, ApiSuccess, ApiFailure } from "../types/api";

const isDev = import.meta.env.MODE === "development";

const API_URL = import.meta.env.VITE_API_URL as string;

if (!API_URL) {
    throw new Error("VITE_API_URL is not defined");
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/**
 * Payload complet envoyé à l’API ClinIA.
 * Le service API est volontairement passif :
 * il transporte exactement ce que l’UI lui fournit.
 */
export type AnalyzeClinicalPayload = ClinicalPayload & {
    forceReal?: boolean;
    openaiModel?: "gpt-4.1-mini" | "gpt-4-0613";
};

/* ------------------------------------------------------------------ */
/* Type guards                                                         */
/* ------------------------------------------------------------------ */

function isApiFailure(obj: unknown): obj is ApiFailure {
    return (
        typeof obj === "object" &&
        obj !== null &&
        "error" in obj &&
        typeof (obj as any).error?.code === "string"
    );
}

function isApiSuccess<T>(obj: unknown): obj is ApiSuccess<T> {
    return (
        typeof obj === "object" &&
        obj !== null &&
        "data" in obj &&
        "meta" in obj
    );
}

/* ------------------------------------------------------------------ */
/* API call                                                            */
/* ------------------------------------------------------------------ */

/**
 * Appelle l’API ClinIA.
 *
 * - Ne throw JAMAIS pour les erreurs métier
 * - Retourne TOUJOURS un ApiResponse<ClinicalAnalysis>
 * - Ne modifie jamais le payload (transport pur)
 */
export async function analyzeClinicalCase(
    payload: AnalyzeClinicalPayload
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
                message: isDev
                    ? `Impossible de contacter le backend. ${API_URL}`
                    : "Impossible de contacter ClinIA",
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
