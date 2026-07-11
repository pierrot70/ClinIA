import { withSecurityIncidentGuard } from "./securityIncidentGuard";
import { authFetch } from "./authService";
import type { ApiResponse } from "../types/api";
import { API_URL } from "./config";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface Patient {
    _id: string;
    nom: string;
    prenom: string;
    num_assurance_maladie: string;
    addresse?: string;
    telephone?: string;
    courriel?: string;
    created_by_reference?: string;
    texto?: boolean;
    lat?: number;
    long?: number;
    documents?: PatientDocument[];
    secure_request_profile?: {
        objective?: string;
        sex?: string;
        age?: string;
        current_medications?: string;
        selected_document_ids?: string[];
        clinicalScope?: string;
        ageGroup?: string;
        symptomProfile?: string;
        cancerType?: string;
        duration?: string;
        severity?: string;
        redFlagStatus?: string;
        comorbidityContext?: string;
        clinicalNotes?: string;
        privacyAttestation?: boolean;
        lastRequestedAt?: string;
    };
}

export interface PatientDocument {
    _id?: string;
    title: string;
    type?: string;
    storageKey?: string;
    uploadedAt?: string;
}

export interface PatientSecureRequestDocument {
    id: string;
    title: string;
    type: string;
    uploadedAt?: string;
    sourceAuditLogId: string;
    clinicalScope: string;
    objective?: string;
    selectedDocumentIds: string[];
}

export interface PaginatedPatients {
    data: Patient[];
    meta: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        source: "real" | "mock" | "degraded";
        model: string;
    };
}

export interface PatientPayload {
    nom: string;
    prenom: string;
    num_assurance_maladie?: string;
    addresse?: string;
    telephone?: string;
    courriel?: string;
    created_by_reference?: string;
    texto?: boolean;
    lat?: number;
    long?: number;
    secure_request_profile?: {
        objective?: string;
        sex?: string;
        age?: string;
        current_medications?: string;
        selected_document_ids?: string[];
        clinicalScope?: string;
        ageGroup?: string;
        symptomProfile?: string;
        cancerType?: string;
        duration?: string;
        severity?: string;
        redFlagStatus?: string;
        comorbidityContext?: string;
        clinicalNotes?: string;
        privacyAttestation?: boolean;
        lastRequestedAt?: string;
    };
}

export interface PatientAuditLog {
    id: string;
    action: "PATIENT_CREATE" | "PATIENT_UPDATE" | "PATIENT_DELETE";
    outcome: "SUCCESS" | "FAILED";
    actorUserId: string | null;
    actorUsernameMasked: string;
    actorRole: string | null;
    ip: string | null;
    patientId: string | null;
    changedFields: string[];
    requestPath: string | null;
    context: {
        secureRequest?: {
            objective?: string;
            clinicalScope?: string;
            selectedDocumentIds?: string[];
            selectedDocumentCount?: number;
        };
    } | null;
    timestamp: string;
}

export interface PaginatedPatientAuditLogs {
    logs: PatientAuditLog[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export interface PatientSecureRequestDocumentsResponse {
    data: PatientSecureRequestDocument[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function safeJson(response: Response): Promise<any> {
    try {
        return await response.json();
    } catch {
        return {
            error: {
                code: "INTERNAL_ERROR",
                message: "Réponse serveur invalide.",
                retryable: true,
            },
        };
    }
}

/* ------------------------------------------------------------------ */
/* GET patients (pagination backend)                                   */
/* ------------------------------------------------------------------ */

export async function fetchPatientsPaginated(
    params: {
        page?: number;
        limit?: number;
        q?: string;
        nom?: string;
        prenom?: string;
        num_assurance_maladie?: string;
        telephone?: string;
        addresse?: string;
        sortBy?: string;
        sortDir?: "asc" | "desc";
    }
): Promise<ApiResponse<PaginatedPatients>> {
    const query = new URLSearchParams();

    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.q) query.set("q", params.q);

    if (params.nom) query.set("nom", params.nom);
    if (params.prenom) query.set("prenom", params.prenom);
    if (params.num_assurance_maladie) {
        query.set("num_assurance_maladie", params.num_assurance_maladie);
    }
    if (params.telephone) {
        query.set("telephone", params.telephone);
    }
    if (params.addresse) {
        query.set("addresse", params.addresse);
    }
    if (params.sortBy) {
        query.set("sortBy", params.sortBy);
    }
    if (params.sortDir) {
        query.set("sortDir", params.sortDir);
    }

    return withSecurityIncidentGuard(
        (async () => {
            try {
                const response = await authFetch(
                    `/api/patients?${query.toString()}`
                );
                return (await safeJson(response)) as ApiResponse<PaginatedPatients>;
            } catch {
                return {
                    error: {
                        code: "INTERNAL_ERROR",
                        message: "Impossible de récupérer les patients.",
                        retryable: true,
                    },
                };
            }
        })()
    );
}

/* ------------------------------------------------------------------ */
/* CREATE patient                                                      */
/* ------------------------------------------------------------------ */

export async function createPatient(
    payload: PatientPayload
): Promise<ApiResponse<Patient>> {
    return withSecurityIncidentGuard(
        (async () => {
            try {
                const response = await authFetch(`/api/patients`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                return (await safeJson(response)) as ApiResponse<Patient>;
            } catch {
                return {
                    error: {
                        code: "INTERNAL_ERROR",
                        message: "Impossible de créer le patient.",
                        retryable: true,
                    },
                };
            }
        })()
    );
}

/* ------------------------------------------------------------------ */
/* UPDATE patient                                                      */
/* ------------------------------------------------------------------ */

export async function updatePatient(
    id: string,
    payload: PatientPayload
): Promise<ApiResponse<Patient>> {
    return withSecurityIncidentGuard(
        (async () => {
            try {
                const response = await authFetch(`/api/patients/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                return (await safeJson(response)) as ApiResponse<Patient>;
            } catch {
                return {
                    error: {
                        code: "INTERNAL_ERROR",
                        message: "Impossible de mettre à jour le patient.",
                        retryable: true,
                    },
                };
            }
        })()
    );
}

/* ------------------------------------------------------------------ */
/* DELETE patient                                                      */
/* ------------------------------------------------------------------ */

export async function deletePatient(
    id: string
): Promise<ApiResponse<Patient>> {
    return withSecurityIncidentGuard(
        (async () => {
            try {
                const response = await authFetch(`/api/patients/${id}`, {
                    method: "DELETE",
                });
                return (await safeJson(response)) as ApiResponse<Patient>;
            } catch {
                return {
                    error: {
                        code: "INTERNAL_ERROR",
                        message: "Impossible de supprimer le patient.",
                        retryable: true,
                    },
                };
            }
        })()
    );
}

/* ------------------------------------------------------------------ */
/* GET patient audit logs                                              */
/* ------------------------------------------------------------------ */

export async function fetchPatientAuditLogs(params: {
    page?: number;
    limit?: number;
    action?: "PATIENT_CREATE" | "PATIENT_UPDATE" | "PATIENT_DELETE" | "";
    patientId?: string;
    actorUserId?: string;
    startDate?: string;
    endDate?: string;
}): Promise<ApiResponse<PaginatedPatientAuditLogs>> {
    const query = new URLSearchParams();

    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.action) query.set("action", params.action);
    if (params.patientId) query.set("patientId", params.patientId);
    if (params.actorUserId) query.set("actorUserId", params.actorUserId);
    if (params.startDate) query.set("startDate", params.startDate);
    if (params.endDate) query.set("endDate", params.endDate);

    return withSecurityIncidentGuard(
        (async () => {
            try {
                const response = await authFetch(
                    `/api/patients/audit-logs?${query.toString()}`
                );
                return (await safeJson(response)) as ApiResponse<PaginatedPatientAuditLogs>;
            } catch {
                return {
                    error: {
                        code: "INTERNAL_ERROR",
                        message: "Impossible de récupérer les audits patient.",
                        retryable: true,
                    },
                };
            }
        })()
    );
}

export async function fetchPatientSecureRequestDocuments(
    patientId: string
): Promise<ApiResponse<PatientSecureRequestDocument[]>> {
    return withSecurityIncidentGuard(
        (async () => {
            try {
                const response = await authFetch(
                    `/api/patients/${patientId}/secure-request-documents`
                );
                return (await safeJson(response)) as ApiResponse<
                    PatientSecureRequestDocument[]
                >;
            } catch {
                return {
                    error: {
                        code: "INTERNAL_ERROR",
                        message:
                            "Impossible de récupérer les documents de requête sécurisée du patient.",
                        retryable: true,
                    },
                };
            }
        })()
    );
}
