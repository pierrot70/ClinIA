// src/types/api.ts

/* ------------------------------------------------------------------ */
/* Codes d’erreur STABLES (contrat frontend IMMUTABLE)                 */
/* ------------------------------------------------------------------ */

export type ApiErrorCode =
    | "AI_UNAVAILABLE"        // OpenAI down / timeout / modèle cassé
    | "AI_DEGRADED"           // IA OK mais fallback/mock utilisé
    | "PERSISTENCE_FAILED"    // Mongo indisponible
    | "INVALID_INPUT"         // Payload invalide
    | "SECURITY_INCIDENT_BLOCKING" // Acknowledgment explicite obligatoire
    | "TOKEN_REVOKED"         // Session invalidée par le backend
    | "ACCOUNT_TEMPORARILY_RESTRICTED" // Restriction temporaire sur routes sensibles
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

    /** Action de remediation demandee par le backend (optionnelle) */
    action?: string;
}

export interface SecurityIncidentBlockingData {
    required: boolean;
    incident: {
        id: string;
        type: string;
        reason: string;
        phase: string;
        timestamp: string;
        context: Record<string, unknown>;
        matches: Array<Record<string, unknown>>;
    };
    acknowledgment: {
        requiredAction: string;
        method: "POST";
        endpoint: string;
    };
    userMessage: string;
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
    blocking?: SecurityIncidentBlockingData;
}

/* ------------------------------------------------------------------ */
/* Réponse API unique (CONTRAT IMMUTABLE)                              */
/* ------------------------------------------------------------------ */

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
