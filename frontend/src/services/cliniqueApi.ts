import type { ApiResponse } from "../types/api";

const API_URL = import.meta.env.VITE_API_URL as string;

if (!API_URL) {
    throw new Error("VITE_API_URL is not defined");
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface Clinique {
    _id: string;
    nom: string;
    num_civique: string;
    rue: string;
    code_postal: string;
    lat?: number;
    long?: number;
    telephone?: string;
    courriel?: string;
}

export interface PaginatedCliniques {
    data: Clinique[];
    meta: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        source: "real" | "mock" | "degraded";
        model: string;
    };
}

export interface CliniquePayload {
    nom: string;
    num_civique: string;
    rue: string;
    code_postal: string;
    lat?: number;
    long?: number;
    telephone?: string;
    courriel?: string;
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
/* GET cliniques (pagination backend)                                  */
/* ------------------------------------------------------------------ */

export async function fetchCliniquesPaginated(
    params: {
        page?: number;
        limit?: number;
        rue?: string;
        code_postal?: string;
        nom?: string;
    }
): Promise<ApiResponse<PaginatedCliniques>> {
    const query = new URLSearchParams();

    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.rue) query.set("rue", params.rue);
    if (params.code_postal) query.set("code_postal", params.code_postal);
    if (params.nom) query.set("nom", params.nom);

    try {
        const response = await fetch(
            `${API_URL}/api/cliniques?${query.toString()}`
        );

        return (await safeJson(response)) as ApiResponse<PaginatedCliniques>;
    } catch {
        return {
            error: {
                code: "INTERNAL_ERROR",
                message: "Impossible de récupérer les cliniques.",
                retryable: true,
            },
        };
    }
}

/* ------------------------------------------------------------------ */
/* CREATE clinique                                                     */
/* ------------------------------------------------------------------ */

export async function createClinique(
    payload: CliniquePayload
): Promise<ApiResponse<Clinique>> {
    try {
        const response = await fetch(`${API_URL}/api/cliniques`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        return (await safeJson(response)) as ApiResponse<Clinique>;
    } catch {
        return {
            error: {
                code: "INTERNAL_ERROR",
                message: "Impossible de créer la clinique.",
                retryable: true,
            },
        };
    }
}

/* ------------------------------------------------------------------ */
/* UPDATE clinique                                                     */
/* ------------------------------------------------------------------ */

export async function updateClinique(
    id: string,
    payload: CliniquePayload
): Promise<ApiResponse<Clinique>> {
    try {
        const response = await fetch(`${API_URL}/api/cliniques/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        return (await safeJson(response)) as ApiResponse<Clinique>;
    } catch {
        return {
            error: {
                code: "INTERNAL_ERROR",
                message: "Impossible de mettre à jour la clinique.",
                retryable: true,
            },
        };
    }
}

/* ------------------------------------------------------------------ */
/* DELETE clinique                                                     */
/* ------------------------------------------------------------------ */

export async function deleteClinique(
    id: string
): Promise<ApiResponse<Clinique>> {
    try {
        const response = await fetch(`${API_URL}/api/cliniques/${id}`, {
            method: "DELETE",
        });

        return (await safeJson(response)) as ApiResponse<Clinique>;
    } catch {
        return {
            error: {
                code: "INTERNAL_ERROR",
                message: "Impossible de supprimer la clinique.",
                retryable: true,
            },
        };
    }
}
