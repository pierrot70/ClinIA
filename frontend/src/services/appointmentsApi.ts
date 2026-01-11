import type { ApiResponse } from "../types/api";

const API_URL = import.meta.env.VITE_API_URL as string;

if (!API_URL) {
    throw new Error("VITE_API_URL is not defined");
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface CreateAppointmentPayload {
    patientInsuranceNumber: string;
    specialist: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:mm
    reason?: string;
}

/* ------------------------------------------------------------------ */
/* Create appointment                                                   */
/* ------------------------------------------------------------------ */

export async function createAppointment(
    payload: CreateAppointmentPayload
): Promise<ApiResponse<any>> {

    let response: Response;

    try {
        response = await fetch(`${API_URL}/api/appointments`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });
    } catch {
        return {
            error: {
                code: "INTERNAL_ERROR",
                message: "Impossible de contacter ClinIA.",
                retryable: true,
            },
        };
    }

    let json: unknown;

    try {
        json = await response.json();
    } catch {
        return {
            error: {
                code: "INTERNAL_ERROR",
                message: "Réponse serveur invalide.",
                retryable: true,
            },
        };
    }

    return json as ApiResponse<any>;
}

/* ------------------------------------------------------------------ */
/* Fetch available slots                                                */
/* ------------------------------------------------------------------ */

export async function fetchAvailableSlots(
    specialist: string,
    date: string
): Promise<ApiResponse<string[]>> {

    let response: Response;

    try {
        response = await fetch(
            `${API_URL}/api/appointments/slots?specialist=${encodeURIComponent(
                specialist
            )}&date=${encodeURIComponent(date)}`,
            {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
    } catch {
        return {
            error: {
                code: "INTERNAL_ERROR",
                message: "Impossible de récupérer les créneaux.",
                retryable: true,
            },
        };
    }

    let json: unknown;

    try {
        json = await response.json();
    } catch {
        return {
            error: {
                code: "INTERNAL_ERROR",
                message: "Réponse serveur invalide.",
                retryable: true,
            },
        };
    }

    return json as ApiResponse<string[]>;
}
