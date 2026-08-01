import type { ApiResponse } from "../types/api";
import { withSecurityIncidentGuard } from "./securityIncidentGuard";
import { API_URL } from "./config";
import { authFetch } from "./authService";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface Appointment {
    _id: string;
    patient?: string;
    patientName?: string | null;
    patientInsuranceNumber?: string;
    specialist: string;
    clinique?: string | null;
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

export type AppointmentSortDirection = "asc" | "desc";

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
    patient: string;
    specialist: string;
    clinique?: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:mm
    reason?: string;
    priority: "normal" | "urgent";
}

export interface AvailableSlotSchedule {
    slots: string[];
    existingAppointmentTimes: string[];
    maximumAppointmentsReached: boolean;
}

export interface AppointmentRecommendation {
    clinique: {
        _id: string;
        nom: string;
        distanceKm: number;
    };
    specialist: {
        _id: string;
        nom: string;
        prenom: string;
        specialite?: string;
    };
    date: string;
    time: string;
    availableSlots: string[];
    existingAppointmentTimes: string[];
}

export interface ManualAppointmentOptions {
    cliniques: Array<{ _id: string; nom: string }>;
    specialists: Array<{
        _id: string;
        nom: string;
        prenom: string;
        clinique_associer: string;
        specialite: string;
    }>;
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
        clinique?: string;
        status?: AppointmentStatus;
        patientInsuranceNumber?: string;
        sortDirection?: AppointmentSortDirection;
    }
): Promise<ApiResponse<PaginatedAppointments>> {
    const query = new URLSearchParams();

    query.set("page", String(params.page));
    query.set("limit", String(params.limit));

    if (params.specialist) {
        query.set("specialist", params.specialist);
    }
    if (params.clinique) {
        query.set("clinique", params.clinique);
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
    if (params.sortDirection) {
        query.set("sortDirection", params.sortDirection);
    }

    return withSecurityIncidentGuard(
        (async () => {
            try {
                const response = await authFetch(
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
        })()
    );
}

/* ------------------------------------------------------------------ */
/* CREATE appointment                                                  */
/* ------------------------------------------------------------------ */

export async function createAppointment(
    payload: CreateAppointmentPayload
): Promise<ApiResponse<Appointment>> {
    return withSecurityIncidentGuard(
        (async () => {
            try {
                const response = await authFetch(`${API_URL}/api/appointments`, {
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
        })()
    );
}

/* ------------------------------------------------------------------ */
/* FETCH available slots                                               */
/* ------------------------------------------------------------------ */

export async function fetchAvailableSlots(
    specialist: string,
    date: string,
    patient?: string
): Promise<ApiResponse<AvailableSlotSchedule>> {
    return withSecurityIncidentGuard(
        (async () => {
            try {
                const query = new URLSearchParams({ specialist, date });
                if (patient) {
                    query.set("patient", patient);
                }
                const response = await authFetch(
                    `${API_URL}/api/appointments/slots?${query.toString()}`
                );
                return (await safeJson(response)) as ApiResponse<AvailableSlotSchedule>;
            } catch {
                return {
                    error: {
                        code: "INTERNAL_ERROR",
                        message: "Impossible de récupérer les créneaux.",
                        retryable: true,
                    },
                };
            }
        })()
    );
}

/* ------------------------------------------------------------------ */
/* FETCH nearest available appointment recommendation                  */
/* ------------------------------------------------------------------ */

export async function fetchAppointmentRecommendation(
    patient: string,
    specialty: string
): Promise<ApiResponse<AppointmentRecommendation | null>> {
    return withSecurityIncidentGuard(
        (async () => {
            try {
                const query = new URLSearchParams({ patient, specialty });
                const response = await authFetch(
                    `${API_URL}/api/appointments/recommendation?${query.toString()}`
                );
                return (await safeJson(response)) as ApiResponse<AppointmentRecommendation | null>;
            } catch {
                return {
                    error: {
                        code: "INTERNAL_ERROR",
                        message: "Impossible de proposer un rendez-vous.",
                        retryable: true,
                    },
                };
            }
        })()
    );
}

export async function fetchManualAppointmentOptions(
    specialty: string
): Promise<ApiResponse<ManualAppointmentOptions>> {
    return withSecurityIncidentGuard(
        (async () => {
            try {
                const query = new URLSearchParams({ specialty });
                const response = await authFetch(
                    `${API_URL}/api/appointments/manual-options?${query.toString()}`
                );
                return (await safeJson(response)) as ApiResponse<ManualAppointmentOptions>;
            } catch {
                return {
                    error: {
                        code: "INTERNAL_ERROR",
                        message:
                            "Impossible de récupérer les options d'attribution manuelle.",
                        retryable: true,
                    },
                };
            }
        })()
    );
}

/* ------------------------------------------------------------------ */
/* Cancel appointment                                                  */
/* ------------------------------------------------------------------ */

export async function cancelAppointment(
    id: string
): Promise<ApiResponse<Appointment>> {
    return withSecurityIncidentGuard(
        (async () => {
            try {
                const response = await authFetch(
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
        })()
    );
}

/* ------------------------------------------------------------------ */
/* Update appointment status                                           */
/* ------------------------------------------------------------------ */

export async function updateAppointmentStatus(
    id: string,
    status: AppointmentStatus
): Promise<ApiResponse<Appointment>> {
    return withSecurityIncidentGuard(
        (async () => {
            try {
                const response = await authFetch(
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
        })()
    );
}

/* ------------------------------------------------------------------ */
/* Update appointment schedule                                         */
/* ------------------------------------------------------------------ */

export async function updateAppointmentSchedule(
    id: string,
    payload: { date: string; time: string }
): Promise<ApiResponse<Appointment>> {
    return withSecurityIncidentGuard(
        (async () => {
            try {
                const response = await authFetch(
                    `${API_URL}/api/appointments/${id}/schedule`,
                    {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                    }
                );
                return (await safeJson(response)) as ApiResponse<Appointment>;
            } catch {
                return {
                    error: {
                        code: "INTERNAL_ERROR",
                        message:
                            "Impossible de modifier l’horaire du rendez-vous.",
                        retryable: true,
                    },
                };
            }
        })()
    );
}
