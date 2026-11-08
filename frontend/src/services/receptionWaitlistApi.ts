import type { ApiResponse } from "../types/api";
import { authFetch } from "./authService";
import { withSecurityIncidentGuard } from "./securityIncidentGuard";

export type WalkInContactChannel = "sms" | "email" | "phone";

export interface WaitlistPatientContext {
    clinic: string;
    insuranceNumber: string;
    patientId?: string;
    bookingProof?: string;
    replaceAppointmentId?: string;
}

interface Enrollment extends WaitlistPatientContext {
    channel: WalkInContactChannel;
    nom?: string;
    prenom?: string;
    telephone?: string;
    courriel?: string;
    consent: true;
}

export async function enrollWalkInWaitlist(enrollment: Enrollment): Promise<ApiResponse<{ _id: string }>> {
    return withSecurityIncidentGuard((async () => {
        try {
            const response = await authFetch("/api/reception/walk-in-waitlist", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(enrollment),
            });
            return await response.json() as ApiResponse<{ _id: string }>;
        } catch {
            return { error: { code: "PERSISTENCE_FAILED", message: "", retryable: true } };
        }
    })());
}
