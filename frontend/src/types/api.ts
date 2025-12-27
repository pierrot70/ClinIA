// src/types/api.ts

/* ------------------------------------------------------------------ */
/* Codes d’erreur STABLES (contrat frontend IMMUTABLE)                 */
/* ------------------------------------------------------------------ */

export type ApiErrorCode =
    | "AI_UNAVAILABLE"        // OpenAI down / timeout / modèle cassé
    | "AI_DEGRADED"           // IA OK mais fallback/mock utilisé
    | "PERSISTENCE_FAILED"    // Mongo indisponible
    | "INVALID_INPUT"         // Payload invalide
    | "INTERNAL_ERROR";       // Bug serveur inattendu

/* ------------------------------------------------------------------ */
/* Erreur normalisée                                                   */
/* ------------------------------------------------------------------ */

export interface ApiError {
    /** Code machine stable (jamais modifié) */
    code: ApiErrorCode;

    /** Message destiné à l’utilisateur final */
    message: string;

    /** Peut-on réessayer automatiquement ? */
    retryable: boolean;
}

/* ------------------------------------------------------------------ */
/* Succès normalisé                                                    */
/* ------------------------------------------------------------------ */

export interface ApiSuccess<T> {
    /** Données métier garanties */
    data: T;

    /** Métadonnées de traçabilité */
    meta: {
        /** Source réelle de la réponse */
        source: "real" | "mock" | "degraded";

        /** Modèle utilisé (ou "mock"/"unknown") */
        model: string;
    };
}

/* ------------------------------------------------------------------ */
/* Échec normalisé                                                     */
/* ------------------------------------------------------------------ */

export interface ApiFailure {
    error: ApiError;
}

/* ------------------------------------------------------------------ */
/* Réponse API unique (CONTRAT IMMUTABLE)                              */
/* ------------------------------------------------------------------ */

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
