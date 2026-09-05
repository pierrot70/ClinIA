import type { ApiResponse } from "../types/api";
import { authFetch } from "./authService";
import { withSecurityIncidentGuard } from "./securityIncidentGuard";

export interface ReceptionClinic {
    _id: string;
    nom: string;
}

export interface WalkInAppointmentOption {
    specialist: {
        _id: string;
        nom: string;
        prenom: string;
    };
    date: string;
    slots: string[];
    slotTypes?: Record<string, "regular" | "walk_in">;
}

export interface WalkInAvailability {
    today: WalkInAppointmentOption[];
    future: WalkInAppointmentOption[];
}

export interface ReceptionPatient {
    _id: string;
    nom: string;
    prenom: string;
    existingAppointments?: { _id: string; date: string; time: string }[];
}

export interface CreateWalkInBookingPayload {
    clinic: string;
    specialist: string;
    date: string;
    time: string;
    slotType: "regular" | "walk_in";
    patientId?: string;
    replaceAppointmentId?: string;
    patient?: {
        nom: string;
        prenom: string;
        num_assurance_maladie: string;
        country: "CA";
        healthInsuranceJurisdiction: "QC";
        language: "fr";
    };
}

export interface WalkInBookingResult {
    patient: ReceptionPatient;
    appointment: {
        _id: string;
        date: string;
        time: string;
    };
}

export async function fetchReceptionClinics(): Promise<ApiResponse<ReceptionClinic[]>> {
    return withSecurityIncidentGuard((async () => {
        try {
            const response = await authFetch("/api/reception/clinics");
            return (await response.json()) as ApiResponse<ReceptionClinic[]>;
        } catch {
            return {
                error: {
                    code: "INTERNAL_ERROR",
                    message: "Impossible de récupérer les cliniques de réception.",
                    retryable: true,
                },
            };
        }
    })());
}

export async function fetchWalkInAvailability(
    clinicId: string,
    patientId?: string,
    replaceAppointmentId?: string
): Promise<ApiResponse<WalkInAvailability>> {
    return withSecurityIncidentGuard((async () => {
        try {
            const query = new URLSearchParams({ clinic: clinicId });
            if (patientId) query.set("patient", patientId);
            if (replaceAppointmentId) query.set("replaceAppointmentId", replaceAppointmentId);
            const response = await authFetch(
                `/api/reception/walk-in-options?${query.toString()}`
            );
            return (await response.json()) as ApiResponse<WalkInAvailability>;
        } catch {
            return {
                error: {
                    code: "INTERNAL_ERROR",
                    message: "Impossible de rechercher les créneaux de consultation.",
                    retryable: true,
                },
            };
        }
    })());
}

export async function findReceptionPatientByRamq(
    clinicId: string,
    ramq: string
): Promise<ApiResponse<ReceptionPatient | null>> {
    return withSecurityIncidentGuard((async () => {
        try {
            const query = new URLSearchParams({ clinic: clinicId, ramq });
            const response = await authFetch(`/api/reception/patient-lookup?${query.toString()}`);
            return (await response.json()) as ApiResponse<ReceptionPatient | null>;
        } catch {
            return {
                error: {
                    code: "INTERNAL_ERROR",
                    message: "Impossible de rechercher le patient.",
                    retryable: true,
                },
            };
        }
    })());
}

export async function createWalkInBooking(
    payload: CreateWalkInBookingPayload
): Promise<ApiResponse<WalkInBookingResult>> {
    return withSecurityIncidentGuard((async () => {
        try {
            const response = await authFetch("/api/reception/walk-in-bookings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            return (await response.json()) as ApiResponse<WalkInBookingResult>;
        } catch {
            return {
                error: {
                    code: "INTERNAL_ERROR",
                    message: "Impossible de créer le dossier et le rendez-vous.",
                    retryable: true,
                },
            };
        }
    })());
}
