import { authFetch } from "./authService";
import { withSecurityIncidentGuard } from "./securityIncidentGuard";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import type { ApiResponse } from "../types/api";

export interface CareClinician {
    _id: string;
    username: string;
    professional: { nom: string; prenom: string; specialty: string };
}
export interface CareGrant {
    _id: string;
    patientId: string;
    issuerUserId: string;
    targetUserId: string;
    status: "ACTIVE" | "REVOKED" | "EXPIRED";
    permission: "READ_APPEND";
    expiresAt: string;
    createdAt: string;
    revokedAt?: string | null;
    target?: { _id: string; username: string };
    patient?: { _id: string; nom: string; prenom: string };
    issuer?: { _id: string; username: string };
}
export interface CareNote {
    _id: string;
    note: string;
    authorUserId: string;
    authorRole?: string | null;
    authorSpecialty?: string | null;
    createdAt: string;
    author?: { _id: string; username: string };
    appointmentId?: string;
}
export interface SharedCareRecord {
    grant: CareGrant;
    patient: { _id: string; nom: string; prenom: string };
    profile: Record<string, unknown>;
    originalNotes: CareNote[];
    sharedNotes: CareNote[];
    notesTruncated: boolean;
    canAppendNote: boolean;
}

const prefix = "/api/clinical-care-access";
async function request<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return withSecurityIncidentGuard((async () => {
        try {
            const response = await authFetch(prefix + path, body === undefined
                ? { cache: "no-store" }
                : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            return await response.json() as ApiResponse<T>;
        } catch {
            return { error: { code: "INTERNAL_ERROR", message: UI_LABELS_FR.clinicalCareAccess.error, retryable: true } };
        }
    })());
}

export const listEligibleCareClinicians = () => request<CareClinician[]>("/eligible-clinicians");
export const listPatientCareGrants = (patientId: string) => request<CareGrant[]>(`/patients/${encodeURIComponent(patientId)}/grants`);
export const createPatientCareGrant = (patientId: string, targetUserId: string, durationMinutes: 60 | 240 | 1440) =>
    request<CareGrant>(`/patients/${encodeURIComponent(patientId)}/grants`, { targetUserId, durationMinutes });
export const revokePatientCareGrant = (grantId: string) => request<CareGrant>(`/grants/${encodeURIComponent(grantId)}/revoke`, {});
export const listReceivedCareGrants = () => request<CareGrant[]>("/grants");
export const readSharedCareRecord = (grantId: string) => request<SharedCareRecord>(`/grants/${encodeURIComponent(grantId)}/record`);
export const appendSharedCareNote = (grantId: string, note: string) => request<{ _id: string }>(`/grants/${encodeURIComponent(grantId)}/notes`, { note });
export const listPatientSharedCareNotes = (patientId: string) => request<{ sharedNotes: CareNote[]; notesTruncated: boolean }>(`/patients/${encodeURIComponent(patientId)}/notes`);

export function careGrantIsActive(grant: CareGrant, now = Date.now()) {
    return grant.status === "ACTIVE" && grant.permission === "READ_APPEND" && Number.isFinite(Date.parse(grant.expiresAt)) && Date.parse(grant.expiresAt) > now;
}
