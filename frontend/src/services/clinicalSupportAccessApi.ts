import { authFetch, SessionExpiredError } from "./authService";
import { withSecurityIncidentGuard } from "./securityIncidentGuard";
import type { ApiError, ApiResponse } from "../types/api";

export type ClinicalSupportReasonCode =
    | "TECHNICAL_SUPPORT"
    | "SECURITY_INCIDENT"
    | "DATA_ACCESS_REQUEST";

export type ClinicalSupportAccessRequest = {
    id: string;
    patientId: string;
    reasonCode: ClinicalSupportReasonCode;
    superadminJustificationCode?: ClinicalSupportReasonCode | null;
    requestedAt: string;
};

export type ActiveClinicalSupportAccess = {
    id: string;
    patientId: string;
    reasonCode: ClinicalSupportReasonCode;
    expiresAt: string;
};

export type PhysicianClinicalSupportRequestStatus = {
    patientId: string;
    status: "OPEN" | "PENDING" | "APPROVED";
};

async function toApiError(response: Response): Promise<ApiError> {
    const payload = await response.json().catch(() => ({}));
    return {
        code: payload?.error?.code || "INTERNAL_ERROR",
        message: payload?.error?.message || "La requête a échoué.",
        retryable: payload?.error?.retryable ?? true,
    } as ApiError;
}

export async function createPhysicianClinicalSupportRequest(payload: {
    patientId: string;
    reasonCode: ClinicalSupportReasonCode;
}): Promise<ApiResponse<{ id: string; status: "OPEN" }>> {
    return withSecurityIncidentGuard((async () => {
        try {
            const response = await authFetch("/api/clinical-support-access/physician-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!response.ok) return { error: await toApiError(response) };
            return (await response.json()) as ApiResponse<{ id: string; status: "OPEN" }>;
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                return { error: { code: "INTERNAL_ERROR", message: "Session expirée.", retryable: false } };
            }
            return { error: { code: "INTERNAL_ERROR", message: "Impossible d'envoyer la demande d'accès.", retryable: true } };
        }
    })());
}

export async function listPhysicianClinicalSupportRequestStatuses(): Promise<
    ApiResponse<PhysicianClinicalSupportRequestStatus[]>
> {
    return withSecurityIncidentGuard((async () => {
        try {
            const response = await authFetch("/api/clinical-support-access/physician-requests/statuses");
            if (!response.ok) return { error: await toApiError(response) };
            return (await response.json()) as ApiResponse<PhysicianClinicalSupportRequestStatus[]>;
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                return { error: { code: "INTERNAL_ERROR", message: "Session expirée.", retryable: false } };
            }
            return { error: { code: "INTERNAL_ERROR", message: "Impossible de charger l'état des demandes de soutien.", retryable: true } };
        }
    })());
}

export async function listOpenClinicalSupportRequests(): Promise<ApiResponse<ClinicalSupportAccessRequest[]>> {
    return withSecurityIncidentGuard((async () => {
        try {
            const response = await authFetch("/api/clinical-support-access/requests/open");
            if (!response.ok) return { error: await toApiError(response) };
            return (await response.json()) as ApiResponse<ClinicalSupportAccessRequest[]>;
        } catch {
            return { error: { code: "INTERNAL_ERROR", message: "Impossible de charger les demandes de soutien.", retryable: true } };
        }
    })());
}

export async function claimClinicalSupportRequest(requestId: string, justificationCode: ClinicalSupportReasonCode): Promise<ApiResponse<{ id: string; status: "PENDING" }>> {
    return withSecurityIncidentGuard((async () => {
        try {
            const response = await authFetch(`/api/clinical-support-access/requests/${encodeURIComponent(requestId)}/claim`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ justificationCode }) });
            if (!response.ok) return { error: await toApiError(response) };
            return (await response.json()) as ApiResponse<{ id: string; status: "PENDING" }>;
        } catch {
            return { error: { code: "INTERNAL_ERROR", message: "Impossible de prendre en charge la demande.", retryable: true } };
        }
    })());
}

export async function listClinicalSupportAccessInbox(): Promise<
    ApiResponse<ClinicalSupportAccessRequest[]>
> {
    return withSecurityIncidentGuard((async () => {
        try {
            const response = await authFetch("/api/clinical-support-access/requests/inbox");
            if (!response.ok) return { error: await toApiError(response) };
            return (await response.json()) as ApiResponse<ClinicalSupportAccessRequest[]>;
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                return { error: { code: "INTERNAL_ERROR", message: "Session expirée.", retryable: false } };
            }
            return { error: { code: "INTERNAL_ERROR", message: "Impossible de charger les demandes d'accès.", retryable: true } };
        }
    })());
}

export async function listActiveClinicalSupportAccess(): Promise<
    ApiResponse<ActiveClinicalSupportAccess[]>
> {
    return withSecurityIncidentGuard((async () => {
        try {
            const response = await authFetch("/api/clinical-support-access/requests/active");
            if (!response.ok) return { error: await toApiError(response) };
            return (await response.json()) as ApiResponse<ActiveClinicalSupportAccess[]>;
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                return { error: { code: "INTERNAL_ERROR", message: "Session expirée.", retryable: false } };
            }
            return { error: { code: "INTERNAL_ERROR", message: "Impossible de charger les accès actifs.", retryable: true } };
        }
    })());
}

export async function listMyActiveClinicalSupportAccess(): Promise<
    ApiResponse<ActiveClinicalSupportAccess[]>
> {
    return withSecurityIncidentGuard((async () => {
        try {
            const response = await authFetch("/api/clinical-support-access/requests/mine");
            if (!response.ok) return { error: await toApiError(response) };
            return (await response.json()) as ApiResponse<ActiveClinicalSupportAccess[]>;
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                return { error: { code: "INTERNAL_ERROR", message: "Session expirée.", retryable: false } };
            }
            return { error: { code: "INTERNAL_ERROR", message: "Impossible de charger vos autorisations actives.", retryable: true } };
        }
    })());
}

export async function revokeClinicalSupportAccess(
    requestId: string
): Promise<ApiResponse<{ id: string; status: "REVOKED"; revokedAt: string }>> {
    return withSecurityIncidentGuard((async () => {
        try {
            const response = await authFetch(
                `/api/clinical-support-access/requests/${encodeURIComponent(requestId)}/revoke`,
                { method: "POST" }
            );
            if (!response.ok) return { error: await toApiError(response) };
            return (await response.json()) as ApiResponse<{ id: string; status: "REVOKED"; revokedAt: string }>;
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                return { error: { code: "INTERNAL_ERROR", message: "Session expirée.", retryable: false } };
            }
            return { error: { code: "INTERNAL_ERROR", message: "Impossible de révoquer l'accès.", retryable: true } };
        }
    })());
}

export async function decideClinicalSupportAccess(
    requestId: string,
    decision: "APPROVE" | "REJECT",
    durationMinutes?: number
): Promise<ApiResponse<{ id: string; status: "APPROVED" | "REJECTED"; expiresAt: string | null }>> {
    return withSecurityIncidentGuard((async () => {
        try {
            const response = await authFetch(
                `/api/clinical-support-access/requests/${encodeURIComponent(requestId)}/decision`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ decision, ...(decision === "APPROVE" ? { durationMinutes } : {}) }),
                }
            );
            if (!response.ok) return { error: await toApiError(response) };
            return (await response.json()) as ApiResponse<{ id: string; status: "APPROVED" | "REJECTED"; expiresAt: string | null }>;
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                return { error: { code: "INTERNAL_ERROR", message: "Session expirée.", retryable: false } };
            }
            return { error: { code: "INTERNAL_ERROR", message: "Impossible de traiter la demande d'accès.", retryable: true } };
        }
    })());
}
