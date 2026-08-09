import { authFetch, SessionExpiredError } from "./authService";
import { withSecurityIncidentGuard } from "./securityIncidentGuard";
import type { ApiError, ApiResponse } from "../types/api";

export type CoordinationRequestStatus =
    | "open"
    | "ready_to_schedule"
    | "resolved"
    | "cancelled";

export type CoordinationRequestEntry = {
    id: string;
    specialty: string;
    status: CoordinationRequestStatus;
    createdAt: string;
    updatedAt: string;
    availabilityVerifiedAt: string | null;
    resolvedAppointment: string | null;
    resolvedAt: string | null;
    patient:
        | { anonymized: true }
        | { anonymized: false; id: string; nom: string; prenom: string }
        | null;
    requestedBy: { id: string; username: string } | null;
};

export type CoordinationRequestsList = {
    requests: CoordinationRequestEntry[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type CoordinationRequestsFilters = {
    page?: number;
    limit?: number;
    status?: CoordinationRequestStatus | "";
};

async function toApiError(response: Response): Promise<ApiError> {
    const payload = await response.json().catch(() => ({}));
    return {
        code: payload?.error?.code || "INTERNAL_ERROR",
        message: payload?.error?.message || "La requête a échoué.",
        retryable: payload?.error?.retryable ?? true,
    };
}

function buildQuery(filters: CoordinationRequestsFilters) {
    const query = new URLSearchParams();
    if (filters.page) query.set("page", String(filters.page));
    if (filters.limit) query.set("limit", String(filters.limit));
    if (filters.status) query.set("status", filters.status);
    return query.toString();
}

export async function listCoordinationRequests(
    filters: CoordinationRequestsFilters
): Promise<ApiResponse<CoordinationRequestsList>> {
    return withSecurityIncidentGuard((async () => {
        try {
            const query = buildQuery(filters);
            const response = await authFetch(`/api/coordination-requests${query ? `?${query}` : ""}`);
            if (!response.ok) return { error: await toApiError(response) };
            return (await response.json()) as ApiResponse<CoordinationRequestsList>;
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                return { error: { code: "SESSION_EXPIRED", message: "Session expirée.", retryable: false } };
            }
            return { error: { code: "NETWORK_ERROR", message: "Impossible de charger les demandes de coordination.", retryable: true } };
        }
    })());
}

export type CoordinationAvailability = {
    clinique: { id: string; nom: string };
    specialist: { id: string; nom: string; prenom: string };
    date: string;
    time: string;
};

export async function verifyCoordinationRequestAvailability(
    requestId: string
): Promise<ApiResponse<{
    id: string;
    status: CoordinationRequestStatus;
    availability: CoordinationAvailability;
}>> {
    return withSecurityIncidentGuard((async () => {
        try {
            const response = await authFetch(
                `/api/coordination-requests/${encodeURIComponent(requestId)}/verify-availability`,
                { method: "PATCH" }
            );
            if (!response.ok) return { error: await toApiError(response) };
            return (await response.json()) as ApiResponse<{
                id: string;
                status: CoordinationRequestStatus;
                availability: CoordinationAvailability;
            }>;
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                return { error: { code: "SESSION_EXPIRED", message: "Session expirée.", retryable: false } };
            }
            return { error: { code: "NETWORK_ERROR", message: "Impossible de vérifier la disponibilité pour cette demande.", retryable: true } };
        }
    })());
}
