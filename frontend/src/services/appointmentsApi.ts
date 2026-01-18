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

export interface CreateAppointmentPayload {
    patientInsuranceNumber: string;
    specialist: string;
    date: string;
    time: string;
    reason?: string;
    priority: "normal" | "urgent";
}

/* ------------------------------------------------------------------ */
/* Cache simple en mémoire (FRONTEND UNIQUEMENT)                       */
/* ------------------------------------------------------------------ */

const appointmentsCache = new Map<string, Appointment[]>();

export function clearAppointmentsCache() {
    appointmentsCache.clear();
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
/* GET appointments (avec cache frontend)                              */
/* ------------------------------------------------------------------ */

export async function fetchAppointments(
    filters?: {
        specialist?: string;
        status?: AppointmentStatus;
        patientInsuranceNumber?: string;
    }
): Promise<ApiResponse<Appointment[]>> {
    const params = new URLSearchParams();
    const cacheKey = JSON.stringify(filters || {});

    /* ---------- Cache HIT ---------- */
    if (appointmentsCache.has(cacheKey)) {
        return {
            data: appointmentsCache.get(cacheKey)!,
            meta: {
                source: "real", // ⚠️ OBLIGATOIRE (contrat ApiResponse)
                model: "mongo", // ⚠️ PAS "cache" (voir explication)
            },
        };
    }

    if (filters?.specialist) {
        params.append("specialist", filters.specialist);
    }
    if (filters?.status) {
        params.append("status", filters.status);
    }
    if (filters?.patientInsuranceNumber) {
        params.append(
            "patientInsuranceNumber",
            filters.patientInsuranceNumber
        );
    }

    try {
        const response = await fetch(
            `${API_URL}/api/appointments?${params.toString()}`
        );

        const json = await safeJson(response);

        if ("data" in json) {
            appointmentsCache.set(cacheKey, json.data);
        }

        return json;
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
/* Create appointment                                                  */
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

        clearAppointmentsCache(); // 🔥 invalide le cache
        return (await safeJson(response)) as ApiResponse<Appointment>;
    } catch {
        return {
            error: {
                code: "INTERNAL_ERROR",
                message: "Impossible de contacter ClinIA.",
                retryable: true,
            },
        };
    }
}

/* ------------------------------------------------------------------ */
/* Fetch available slots                                               */
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

        clearAppointmentsCache();
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

        clearAppointmentsCache();
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
