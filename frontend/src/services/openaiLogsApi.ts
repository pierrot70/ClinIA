import { authFetch, SessionExpiredError } from "./authService";
import type { ApiError, ApiResponse } from "../types/api";

export type OpenAILogEntry = {
    id: string;
    action: string;
    outcome: string;
    actorUserId: string | null;
    actorUsernameMasked: string;
    actorRole: string | null;
    ip: string | null;
    requestPath: string;
    transport: string;
    model: string;
    payloadHash: string;
    payloadSizeBytes: number;
    dataClassification: string;
    acknowledgmentIncidentId: string | null;
    neutralized: boolean;
    upstreamRequestId: string | null;
    errorCode: string | null;
    requestContext: Record<string, unknown> | null;
    timestamp: string;
};

export type OpenAILogPagination = {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
};

export type OpenAILogFilters = {
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    action?: string;
    outcome?: string;
    actorUserId?: string;
    actorUsernameMasked?: string;
    actorRole?: string;
    ip?: string;
    requestPath?: string;
    transport?: string;
    model?: string;
    payloadHash?: string;
    payloadSizeBytes?: string;
    dataClassification?: string;
    acknowledgmentIncidentId?: string;
    neutralized?: string;
    upstreamRequestId?: string;
    errorCode?: string;
};

export type OpenAILogsResponse = {
    logs: OpenAILogEntry[];
    pagination: OpenAILogPagination;
};

function buildQuery(filters: OpenAILogFilters) {
    const query = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
        if (value == null) {
            return;
        }

        const normalized = String(value).trim();
        if (!normalized) {
            return;
        }

        query.set(key, normalized);
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

export async function fetchOpenAILogs(
    filters: OpenAILogFilters
): Promise<ApiResponse<OpenAILogsResponse>> {
    try {
        const query = buildQuery(filters);
        const response = await authFetch(`/api/openai-logs${query ? `?${query}` : ""}`);

        if (!response.ok) {
            return { error: await toApiError(response) };
        }

        return (await response.json()) as ApiResponse<OpenAILogsResponse>;
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
                message: "Erreur reseau lors du chargement des journaux OpenAI.",
                retryable: true,
            },
        };
    }
}

export async function exportOpenAILogsCsv(filters: OpenAILogFilters) {
    const query = buildQuery(filters);
    const response = await authFetch(`/api/openai-logs/export.csv${query ? `?${query}` : ""}`);

    if (!response.ok) {
        throw new Error((await toApiError(response)).message);
    }

    return {
        blob: await response.blob(),
        truncated: response.headers.get("X-Export-Truncated") === "true",
    };
}