import { withSecurityIncidentGuard } from "./securityIncidentGuard";
import { authFetch } from "./authService";
import type { ApiResponse } from "../types/api";
import { API_URL } from "./config";

export interface Specialist {
    _id: string;
    nom: string;
    prenom: string;
    numero_medecin: string;
    telephone?: string;
    email?: string;
    accountUserId?: string | null;
    texto?: boolean;
    clinique_associer?: string | null;
    specialite?: string;
    disponibilites?: string[];
    walkInDisponibilites?: string[];
    practiceLocations?: Array<{
        clinique: string;
        disponibilites: string[];
        walkInDisponibilites?: string[];
    }>;
}

export interface PaginatedSpecialists {
    data: Specialist[];
    meta: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        source: "real" | "mock" | "degraded";
        model: string;
    };
}

export interface SpecialistPayload {
    nom: string;
    prenom: string;
    numero_medecin: string;
    telephone?: string;
    email?: string;
    accountUserId?: string | null;
    texto?: boolean;
    clinique_associer?: string | null;
    specialite?: string;
    disponibilites?: string[];
    walkInDisponibilites?: string[];
    practiceLocations?: Array<{
        clinique: string;
        disponibilites: string[];
        walkInDisponibilites?: string[];
    }>;
}

export interface ClinicianAccount {
    id: string;
    username: string;
    email: string | null;
}

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

export async function fetchSpecialistsPaginated(
    params: {
        page?: number;
        limit?: number;
        nom?: string;
        prenom?: string;
        numero_medecin?: string;
        telephone?: string;
        email?: string;
        clinique_associer?: string;
    }
): Promise<ApiResponse<PaginatedSpecialists>> {
    const query = new URLSearchParams();

    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));

    if (params.nom) query.set("nom", params.nom);
    if (params.prenom) query.set("prenom", params.prenom);
    if (params.numero_medecin)
        query.set("numero_medecin", params.numero_medecin);
    if (params.telephone) query.set("telephone", params.telephone);
    if (params.email) query.set("email", params.email);
    if (params.clinique_associer)
        query.set("clinique_associer", params.clinique_associer);

    return withSecurityIncidentGuard(
        (async () => {
            try {
                const response = await authFetch(
                    `/api/specialists?${query.toString()}`
                );
                return (await safeJson(response)) as ApiResponse<PaginatedSpecialists>;
            } catch {
                return {
                    error: {
                        code: "INTERNAL_ERROR",
                        message: "Impossible de récupérer les spécialistes.",
                        retryable: true,
                    },
                };
            }
        })()
    );
}

export async function fetchEligibleClinicianAccounts(): Promise<ApiResponse<ClinicianAccount[]>> {
    return withSecurityIncidentGuard(
        (async () => {
            try {
                const response = await authFetch(`/api/specialists/clinician-accounts`);
                return (await safeJson(response)) as ApiResponse<ClinicianAccount[]>;
            } catch {
                return {
                    error: {
                        code: "INTERNAL_ERROR",
                        message: "Impossible de récupérer les comptes médecins.",
                        retryable: true,
                    },
                };
            }
        })()
    );
}

export async function createSpecialist(
    payload: SpecialistPayload
): Promise<ApiResponse<Specialist>> {
    return withSecurityIncidentGuard(
        (async () => {
            try {
                const response = await authFetch(`/api/specialists`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                return (await safeJson(response)) as ApiResponse<Specialist>;
            } catch {
                return {
                    error: {
                        code: "INTERNAL_ERROR",
                        message: "Impossible de créer le spécialiste.",
                        retryable: true,
                    },
                };
            }
        })()
    );
}

export async function updateSpecialist(
    id: string,
    payload: SpecialistPayload
): Promise<ApiResponse<Specialist>> {
    return withSecurityIncidentGuard(
        (async () => {
            try {
                const response = await authFetch(`/api/specialists/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                return (await safeJson(response)) as ApiResponse<Specialist>;
            } catch {
                return {
                    error: {
                        code: "INTERNAL_ERROR",
                        message: "Impossible de mettre à jour le spécialiste.",
                        retryable: true,
                    },
                };
            }
        })()
    );
}

export async function deleteSpecialist(
    id: string
): Promise<ApiResponse<Specialist>> {
    return withSecurityIncidentGuard(
        (async () => {
            try {
                const response = await authFetch(`/api/specialists/${id}`, {
                    method: "DELETE",
                });
                return (await safeJson(response)) as ApiResponse<Specialist>;
            } catch {
                return {
                    error: {
                        code: "INTERNAL_ERROR",
                        message: "Impossible de supprimer le spécialiste.",
                        retryable: true,
                    },
                };
            }
        })()
    );
}
