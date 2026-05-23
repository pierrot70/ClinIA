import { authFetch, SessionExpiredError } from "./authService";
import { withSecurityIncidentGuard } from "./securityIncidentGuard";
import type { ApiError, ApiResponse } from "../types/api";

export const REQUIRED_ACK_ACTION = "J'ai lu et compris";

export interface SecurityIncidentEntry {
    id: string;
    type: string;
    phase: string;
    reason: string;
    requestPath: string;
    transport: string;
    matches: Array<Record<string, unknown>>;
    context: Record<string, unknown>;
    detectedAt: string;
    acknowledged: boolean;
    acknowledgmentAction: string;
    acknowledgedAt: string | null;
    acknowledgmentContext: Record<string, unknown>;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface SecurityIncidentPagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export interface SecurityIncidentListResult {
    incidents: SecurityIncidentEntry[];
    pagination: SecurityIncidentPagination;
}

export interface SecurityIncidentAcknowledgePayload {
    incidentId: string;
    action: string;
    context: Record<string, unknown>;
}

export interface SecurityIncidentAcknowledgeResult {
    incidentId: string;
    acknowledged: boolean;
    acknowledgedAt: string;
    action: string;
    context: Record<string, unknown>;
}

export interface SecurityIncidentListFilters {
    page?: number;
    limit?: number;
    acknowledged?: "true" | "false";
    type?: string;
}

function buildQuery(filters: SecurityIncidentListFilters) {
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

export async function listSecurityIncidents(
    filters: SecurityIncidentListFilters
): Promise<ApiResponse<SecurityIncidentListResult>> {
    return withSecurityIncidentGuard(
        (async () => {
            try {
                const query = buildQuery(filters);
                const response = await authFetch(
                    `/api/security/incidents${query ? `?${query}` : ""}`
                );

                if (!response.ok) {
                    return { error: await toApiError(response) };
                }

                return (await response.json()) as ApiResponse<SecurityIncidentListResult>;
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
                        message:
                            "Impossible de charger les incidents de securite.",
                        retryable: true,
                    },
                };
            }
        })()
    );
}

export async function acknowledgeSecurityIncident(
    payload: SecurityIncidentAcknowledgePayload
): Promise<ApiResponse<SecurityIncidentAcknowledgeResult>> {
    return withSecurityIncidentGuard(
        (async () => {
            try {
                const response = await authFetch(
                    "/api/security/incidents/acknowledge",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(payload),
                    }
                );
                return (await response.json()) as ApiResponse<SecurityIncidentAcknowledgeResult>;
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
                        message:
                            "Impossible d'enregistrer l'acknowledgment de securite. Verifiez la connexion puis reessayez.",
                        retryable: true,
                    },
                };
            }
        })()
    );
}
