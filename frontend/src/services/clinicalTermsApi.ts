import { authFetch, SessionExpiredError } from "./authService";
import { withSecurityIncidentGuard } from "./securityIncidentGuard";
import type { ApiError, ApiResponse } from "../types/api";

export type PendingClinicalTermRequest = {
    _id: string;
    proposedTerm: string;
    field: "symptoms";
    createdAt: string;
};

export type ApprovedClinicalTerm = { field: "symptoms"; canonicalValue: string; aliases: string[] };

async function toApiError(response: Response): Promise<ApiError> {
    const payload = await response.json().catch(() => ({}));
    return { code: payload?.error?.code || "INTERNAL_ERROR", message: payload?.error?.message || "La requête a échoué.", retryable: payload?.error?.retryable ?? true };
}

export async function listPendingClinicalTermRequests(): Promise<ApiResponse<PendingClinicalTermRequest[]>> {
    return withSecurityIncidentGuard((async () => {
        try {
            const response = await authFetch("/api/clinical-terms/requests/pending");
            return response.ok ? await response.json() : { error: await toApiError(response) };
        } catch (error) {
            return { error: { code: "INTERNAL_ERROR", message: error instanceof SessionExpiredError ? "Session expirée." : "Impossible de charger les demandes du catalogue.", retryable: true } };
        }
    })());
}

export async function createClinicalTermRequest(term: string): Promise<ApiResponse<{ id: string; status: string }>> {
    return withSecurityIncidentGuard((async () => {
        try {
            const response = await authFetch("/api/clinical-terms/requests", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ term }),
            });
            return response.ok ? await response.json() : { error: await toApiError(response) };
        } catch (error) {
            return { error: { code: "INTERNAL_ERROR", message: error instanceof SessionExpiredError ? "Session expirée." : "Impossible d'envoyer la demande.", retryable: true } };
        }
    })());
}

export async function listApprovedClinicalTerms(): Promise<ApiResponse<ApprovedClinicalTerm[]>> {
    return withSecurityIncidentGuard((async () => {
        try {
            const response = await authFetch("/api/clinical-terms/approved");
            return response.ok ? await response.json() : { error: await toApiError(response) };
        } catch (error) {
            return { error: { code: "INTERNAL_ERROR", message: error instanceof SessionExpiredError ? "Session expirée." : "Impossible de charger le catalogue.", retryable: true } };
        }
    })());
}

export async function decideClinicalTermRequest(id: string, decision: "APPROVED" | "REJECTED"): Promise<ApiResponse<{ id: string; status: string }>> {
    return withSecurityIncidentGuard((async () => {
        try {
            const response = await authFetch(`/api/clinical-terms/requests/${encodeURIComponent(id)}/decision`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }),
            });
            return response.ok ? await response.json() : { error: await toApiError(response) };
        } catch (error) {
            return { error: { code: "INTERNAL_ERROR", message: error instanceof SessionExpiredError ? "Session expirée." : "Impossible de traiter la demande.", retryable: true } };
        }
    })());
}
