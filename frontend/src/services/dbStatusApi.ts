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

export type DbStatusBackup = {
    fileName: string;
    sizeBytes: number | null;
    createdAt: string | null;
    modifiedAt: string | null;
    ageHours: number | null;
    sha256FilePresent: boolean;
    sha256Verified: boolean | null;
    sha256Error: string | null;
    protected: boolean;
    protectedAt: string | null;
    keepError: string | null;
    manifest: {
        available: boolean;
        databaseName: string | null;
        generatedAt: string | null;
        collectionCount: number | null;
        documentCount: number | null;
        error?: string | null;
    };
};

export type DbStatusReplicaMember = {
    name: string;
    role: "primary" | "secondary" | "arbiter" | "unknown";
    state: string;
    onlineStatus: "online" | "down" | "unknown";
    syncStatus: "synced" | "syncing" | "unsynced" | "unknown";
    health: number | null;
    lagSeconds: number | null;
    error: string | null;
    source: string;
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
        members: DbStatusReplicaMember[];
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
    backups: {
        available: boolean;
        directory: string;
        keepDirectory: string;
        retentionDays: number;
        maxBackups: number;
        expectedFrequencyHours: number;
        checksumMode: "recorded" | "verified";
        latestAgeHours: number | null;
        latestStatus: "ok" | "warning" | "missing" | "unavailable";
        backups: DbStatusBackup[];
        error: string | null;
    };
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

export async function updateBackupProtection(fileName: string, protect: boolean): Promise<ApiResponse<{ fileName: string; protected: boolean; protectedAt: string | null }>> {
    try {
        const response = await authFetch(
            `/api/db-status/backups/${encodeURIComponent(fileName)}/protection`,
            { method: protect ? "POST" : "DELETE" }
        );

        if (!response.ok) {
            return { error: await toApiError(response) };
        }

        return (await response.json()) as ApiResponse<{ fileName: string; protected: boolean; protectedAt: string | null }>;
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
                message: "Erreur reseau lors de la mise a jour de la conservation du backup.",
                retryable: true,
            },
        };
    }
}
