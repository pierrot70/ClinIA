import type { ApiResponse } from "../types/api";

const API_URL = import.meta.env.VITE_API_URL as string;

if (!API_URL) {
    throw new Error("VITE_API_URL is not defined");
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface Appointment {
    _id: string;
    patientInsuranceNumber: string;
    specialist: string;
    date: string;
    time: string;
    reason?: string;
    priority?: "normal" | "urgent";
    status: "scheduled" | "cancelled" | "completed";
    createdAt: string;
}

export type AppointmentStatus =
    | "scheduled"
    | "cancelled"
    | "completed";

export interface PaginatedAppointments {
    data: Appointment[];
    meta: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        source: "real" | "mock" | "degraded";
        model: string;
    };
}

export interface CreateAppointmentPayload {
    patientInsuranceNumber: string;
    specialist: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:mm
    reason?: string;
    priority: "normal" | "urgent";
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
/* GET appointments (pagination backend)                               */
/* ------------------------------------------------------------------ */

export async function fetchAppointmentsPaginated(
    params: {
        page: number;
        limit: number;
        specialist?: string;
        status?: AppointmentStatus;
        patientInsuranceNumber?: string;
    }
): Promise<ApiResponse<PaginatedAppointments>> {
    const query = new URLSearchParams();

    query.set("page", String(params.page));
    query.set("limit", String(params.limit));

    if (params.specialist) {
        query.set("specialist", params.specialist);
    }
    if (params.status) {
        query.set("status", params.status);
    }
    if (params.patientInsuranceNumber) {
        query.set(
            "patientInsuranceNumber",
            params.patientInsuranceNumber
        );
    }

    try {
        const response = await fetch(
            `${API_URL}/api/appointments?${query.toString()}`
        );

        return (await safeJson(response)) as ApiResponse<PaginatedAppointments>;
    } catch {
        return {
            error: {
                code: "INTERNAL_ERROR",
                message: "Impossible de récupérer les rendez-vous.",
                retryable: true,
            },
        };
    }
}

/* ------------------------------------------------------------------ */
/* CREATE appointment                                                  */
/* ------------------------------------------------------------------ */

export async function createAppointment(
    payload: CreateAppointmentPayload
): Promise<ApiResponse<Appointment>> {
    try {
        const response = await fetch(`${API_URL}/api/appointments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        return (await safeJson(response)) as ApiResponse<Appointment>;
    } catch {
        return {
            error: {
                code: "INTERNAL_ERROR",
                message: "Impossible de créer le rendez-vous.",
                retryable: true,
            },
        };
    }
}

/* ------------------------------------------------------------------ */
/* FETCH available slots                                               */
/* ------------------------------------------------------------------ */

export async function fetchAvailableSlots(
    specialist: string,
    date: string
): Promise<ApiResponse<string[]>> {
    try {
        const response = await fetch(
            `${API_URL}/api/appointments/slots?specialist=${encodeURIComponent(
                specialist
            )}&date=${encodeURIComponent(date)}`
        );

        return (await safeJson(response)) as ApiResponse<string[]>;
    } catch {
        return {
            error: {
                code: "INTERNAL_ERROR",
                message: "Impossible de récupérer les créneaux.",
                retryable: true,
            },
        };
    }
}

/* ------------------------------------------------------------------ */
/* Cancel appointment                                                  */
/* ------------------------------------------------------------------ */

export async function cancelAppointment(
    id: string
): Promise<ApiResponse<Appointment>> {
    try {
        const response = await fetch(
            `${API_URL}/api/appointments/${id}`,
            { method: "DELETE" }
        );

        return (await safeJson(response)) as ApiResponse<Appointment>;
    } catch {
        return {
            error: {
                code: "INTERNAL_ERROR",
                message: "Impossible d’annuler le rendez-vous.",
                retryable: true,
            },
        };
    }
}

/* ------------------------------------------------------------------ */
/* Update appointment status                                           */
/* ------------------------------------------------------------------ */

export async function updateAppointmentStatus(
    id: string,
    status: AppointmentStatus
): Promise<ApiResponse<Appointment>> {
    try {
        const response = await fetch(
            `${API_URL}/api/appointments/${id}/status`,
            {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            }
        );

        return (await safeJson(response)) as ApiResponse<Appointment>;
    } catch {
        return {
            error: {
                code: "INTERNAL_ERROR",
                message: "Impossible de mettre à jour le statut.",
                retryable: true,
            },
        };
    }
}
