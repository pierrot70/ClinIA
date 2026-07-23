import { withSecurityIncidentGuard } from "./securityIncidentGuard";
import { authFetch } from "./authService";
import type { ApiResponse } from "../types/api";
import type { ClinicalPayload } from "../types/clinical";
import { API_URL } from "./config";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type PatientLanguage =
    | "fr"
    | "en"
    | "es"
    | "ko"
    | "vi"
    | "no"
    | "ja"
    | "zh"
    | "he";

export type HealthInsuranceJurisdiction =
    | "AB"
    | "BC"
    | "MB"
    | "NB"
    | "NL"
    | "NS"
    | "NT"
    | "NU"
    | "ON"
    | "PE"
    | "QC"
    | "SK"
    | "YT"
    | "UNKNOWN";

export type PatientCountry = "CA";

export interface Patient {
    _id: string;
    nom: string;
    prenom: string;
    num_assurance_maladie: string;
    country?: PatientCountry;
    healthInsuranceJurisdiction?: HealthInsuranceJurisdiction;
    addresse?: string;
    telephone?: string;
    courriel?: string;
    created_by_reference?: string;
    archivedAt?: string | null;
    archivedByUserId?: string | null;
    texto?: boolean;
    language?: PatientLanguage | "sp";
    lat?: number;
    long?: number;
    documents?: PatientDocument[];
    secure_request_profile?: {
        objective?: string;
        sex?: string;
        age?: string;
        current_medications?: string;
        clinicalAnalysisParameters?: ClinicalPayload;
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
    sourceAuditLogId: string | null;
    clinicalScope: string;
    objective?: string;
    selectedDocumentIds: string[];
}

export interface PatientClinicalNoteVersion {
    id: string;
    version: number;
    note: string;
    changeType: "BASELINE" | "UPDATE" | "RESTORE";
    restoredFromVersionId: string | null;
    actorUsernameMasked: string;
    actorRole: string | null;
    createdAt: string;
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
    country?: PatientCountry;
    healthInsuranceJurisdiction?: HealthInsuranceJurisdiction;
    addresse?: string;
    telephone?: string;
    courriel?: string;
    created_by_reference?: string;
    texto?: boolean;
    language?: PatientLanguage;
    lat?: number;
    long?: number;
    secure_request_profile?: {
        objective?: string;
        sex?: string;
        age?: string;
        current_medications?: string;
        clinicalAnalysisParameters?: ClinicalPayload;
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
    action:
        | "PATIENT_CREATE"
        | "PATIENT_UPDATE"
        | "PATIENT_ARCHIVE"
        | "PATIENT_DELETE";
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
            objectiveProvided?: boolean;
            clinicalScopeProvided?: boolean;
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
        archiveStatus?: "active" | "archived";
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
    if (params.archiveStatus) {
        query.set("archiveStatus", params.archiveStatus);
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

export async function fetchPatientClinicalNoteVersions(
    patientId: string
): Promise<ApiResponse<PatientClinicalNoteVersion[]>> {
    return withSecurityIncidentGuard(
        (async () => {
            try {
                const response = await authFetch(`/api/patients/${patientId}/clinical-note-versions`);
                return (await safeJson(response)) as ApiResponse<PatientClinicalNoteVersion[]>;
            } catch {
                return { error: { code: "INTERNAL_ERROR", message: "Impossible de recuperer l'historique clinique.", retryable: true } };
            }
        })()
    );
}

export async function restorePatientClinicalNoteVersion(
    patientId: string,
    versionId: string
): Promise<ApiResponse<Patient>> {
    return withSecurityIncidentGuard(
        (async () => {
            try {
                const response = await authFetch(
                    `/api/patients/${patientId}/clinical-note-versions/${versionId}/restore`,
                    { method: "POST" }
                );
                return (await safeJson(response)) as ApiResponse<Patient>;
            } catch {
                return { error: { code: "INTERNAL_ERROR", message: "Impossible de restaurer la version clinique.", retryable: true } };
            }
        })()
    );
}

/* ------------------------------------------------------------------ */
/* CREATE patient                                                      */
/* ------------------------------------------------------------------ */

export async function createPatient(
    payload: PatientPayload,
    { confirmPotentialDuplicate = false } = {}
): Promise<ApiResponse<Patient>> {
    return withSecurityIncidentGuard(
        (async () => {
            try {
                const response = await authFetch(`/api/patients`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(confirmPotentialDuplicate
                            ? { "X-Confirm-Potential-Duplicate": "true" }
                            : {}),
                    },
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
/* Archive patient                                                     */
/* ------------------------------------------------------------------ */

export async function archivePatient(
    id: string,
    reason: string
): Promise<ApiResponse<Patient>> {
    return withSecurityIncidentGuard(
        (async () => {
            try {
                const response = await authFetch(`/api/patients/${id}`, {
                    method: "DELETE",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ reason }),
                });
                return (await safeJson(response)) as ApiResponse<Patient>;
            } catch {
                return {
                    error: {
                        code: "INTERNAL_ERROR",
                        message: "Impossible d'archiver le patient.",
                        retryable: true,
                    },
                };
            }
        })()
    );
}

export async function restorePatient(
    id: string,
    reason: string
): Promise<ApiResponse<Patient>> {
    return withSecurityIncidentGuard(
        (async () => {
            try {
                const response = await authFetch(`/api/patients/${id}/restore`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ reason }),
                });
                return (await safeJson(response)) as ApiResponse<Patient>;
            } catch {
                return {
                    error: {
                        code: "INTERNAL_ERROR",
                        message: "Impossible de réactiver le patient.",
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
    action?:
        | "PATIENT_CREATE"
        | "PATIENT_UPDATE"
        | "PATIENT_ARCHIVE"
        | "PATIENT_DELETE"
        | "";
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
