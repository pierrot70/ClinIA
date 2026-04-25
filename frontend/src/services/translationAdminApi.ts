import { authFetch, SessionExpiredError } from "./authService";
import type { ApiError, ApiResponse } from "../types/api";

export type TranslationCacheEntry = {
    id: string;
    namespace: string;
    sourceLocale: string;
    targetLang: string;
    sourceHash: string;
    sourceText: string;
    payload: Record<string, unknown>;
    voiceAck: string;
    voicePrompts: Record<string, unknown>;
    model: string;
    createdAt?: string;
    updatedAt?: string;
};

export type TranslationFilters = {
    page?: number;
    limit?: number;
    namespace?: string;
    sourceLocale?: string;
    targetLang?: string;
    search?: string;
};

export type TranslationListResponse = {
    translations: TranslationCacheEntry[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
    filters: {
        namespace: string;
        sourceLocale: string;
        targetLang: string;
        search: string;
    };
};

function buildQuery(filters: TranslationFilters) {
    const query = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
        if (value == null) {
            return;
        }

        const normalized = String(value).trim();
        if (normalized) {
            query.set(key, normalized);
        }
    });

    return query.toString();
}

async function toApiError(response: Response): Promise<ApiError> {
    const payload = await response.json().catch(() => ({}));
    return {
        code: payload?.error?.code || "INTERNAL_ERROR",
        message: payload?.error?.message || "La requete a echoue.",
        retryable: payload?.error?.retryable ?? true,
    };
}

function sessionExpiredError(): ApiError {
    return {
        code: "INTERNAL_ERROR",
        message: "Session expiree.",
        retryable: false,
    };
}

export async function fetchTranslationCache(
    filters: TranslationFilters
): Promise<ApiResponse<TranslationListResponse>> {
    try {
        const query = buildQuery(filters);
        const response = await authFetch(
            `/api/admin/translations${query ? `?${query}` : ""}`
        );

        if (!response.ok) {
            return { error: await toApiError(response) };
        }

        return (await response.json()) as ApiResponse<TranslationListResponse>;
    } catch (err) {
        if (err instanceof SessionExpiredError) {
            return { error: sessionExpiredError() };
        }

        return {
            error: {
                code: "INTERNAL_ERROR",
                message: "Erreur reseau lors du chargement des traductions.",
                retryable: true,
            },
        };
    }
}

export async function updateTranslationCacheEntry({
    id,
    sourceText,
    payload,
}: {
    id: string;
    sourceText: string;
    payload: Record<string, unknown>;
}): Promise<ApiResponse<{ translation: TranslationCacheEntry }>> {
    try {
        const response = await authFetch(`/api/admin/translations/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceText, payload }),
        });

        if (!response.ok) {
            return { error: await toApiError(response) };
        }

        return (await response.json()) as ApiResponse<{
            translation: TranslationCacheEntry;
        }>;
    } catch (err) {
        if (err instanceof SessionExpiredError) {
            return { error: sessionExpiredError() };
        }

        return {
            error: {
                code: "INTERNAL_ERROR",
                message: "Erreur reseau lors de la sauvegarde.",
                retryable: true,
            },
        };
    }
}

export async function deleteTranslationCacheEntry(
    id: string
): Promise<ApiResponse<{ success: boolean; translation: TranslationCacheEntry }>> {
    try {
        const response = await authFetch(`/api/admin/translations/${id}`, {
            method: "DELETE",
        });

        if (!response.ok) {
            return { error: await toApiError(response) };
        }

        return (await response.json()) as ApiResponse<{
            success: boolean;
            translation: TranslationCacheEntry;
        }>;
    } catch (err) {
        if (err instanceof SessionExpiredError) {
            return { error: sessionExpiredError() };
        }

        return {
            error: {
                code: "INTERNAL_ERROR",
                message: "Erreur reseau lors de la suppression.",
                retryable: true,
            },
        };
    }
}
