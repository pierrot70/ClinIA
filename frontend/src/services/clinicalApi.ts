import { withSecurityIncidentGuard } from "./securityIncidentGuard";
import { authFetch } from "./authService";
// src/services/clinicalApi.ts

import type { ClinicalAnalysis, ClinicalPayload } from "../types/clinical";
import type { ApiResponse, ApiSuccess, ApiFailure } from "../types/api";
import { API_URL } from "./config";

const isDev = import.meta.env.MODE === "development";

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
    return withSecurityIncidentGuard(
        (async () => {
            let response: Response;
            try {
                response = await authFetch(`${API_URL}/api/ai/analyze`, {
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

            if (isApiFailure(json)) {
                return json;
            }
            if (isApiSuccess<ClinicalAnalysis>(json)) {
                return json;
            }
            return {
                error: {
                    code: "INTERNAL_ERROR",
                    message: "Format de réponse inconnu.",
                    retryable: false,
                },
            };
        })()
    );
}
