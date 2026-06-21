import { authFetch, SessionExpiredError } from "./authService";
import type { ApiError, ApiResponse } from "../types/api";

export type DbStatusCollection = {
    name: string;
    status: "ok" | "error";
    documentCount: number | null;
    sizeBytes: number | null;
    storageSizeBytes: number | null;
    indexCount: number | null;
    indexSizeBytes: number | null;
    error: string | null;
};

export type DbStatusPayload = {
    checkedAt: string;
    responseTimeMs: number;
    connection: {
        readyState: number;
        status: string;
        databaseName: string | null;
        host: string | null;
        port: number | null;
    };
    ping: {
        ok: boolean;
        latencyMs: number | null;
        error?: string | null;
    };
    replicaSet: {
        available: boolean;
        setName: string | null;
        isWritablePrimary: boolean | null;
        secondary: boolean | null;
        primary: string | null;
        hosts: string[];
        error: string | null;
    };
    database: null | {
        status: "ok" | "error";
        collections?: number;
        objects?: number;
        dataSizeBytes?: number;
        storageSizeBytes?: number;
        indexes?: number;
        indexSizeBytes?: number;
        error?: string;
    };
    collections: DbStatusCollection[];
};

async function toApiError(response: Response): Promise<ApiError> {
    const payload = await response.json().catch(() => ({}));
    return {
        code: payload?.error?.code || "INTERNAL_ERROR",
        message: payload?.error?.message || "La requete a echoue.",
        retryable: payload?.error?.retryable ?? true,
    } as ApiError;
}

export async function fetchDbStatus(): Promise<ApiResponse<DbStatusPayload>> {
    try {
        const response = await authFetch("/api/db-status");

        if (!response.ok) {
            return { error: await toApiError(response) };
        }

        return (await response.json()) as ApiResponse<DbStatusPayload>;
    } catch (err) {
        if (err instanceof SessionExpiredError) {
            return {
                error: {
                    code: "INTERNAL_ERROR",
                    message: "Session expiree.",
                    retryable: false,
                },
            };
        }

        return {
            error: {
                code: "INTERNAL_ERROR",
                message: "Erreur reseau lors du chargement de l'etat des bases de donnees.",
                retryable: true,
            },
        };
    }
}
