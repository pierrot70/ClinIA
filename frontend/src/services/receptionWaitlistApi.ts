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
    telephoneSms?: string;
    courriel?: string;
    consent: true;
}

interface Withdrawal {
    clinic: string;
    patientId: string;
    bookingProof: string;
    entryId: string;
}

export function enrollWalkInWaitlist(enrollment: Enrollment) {
    return postWaitlist<{ _id: string }>("/api/reception/walk-in-waitlist", enrollment);
}

export function withdrawWalkInWaitlist(withdrawal: Withdrawal) {
    return postWaitlist<{ _id: string; bookingProof: string }>("/api/reception/walk-in-waitlist/withdraw", withdrawal);
}

async function postWaitlist<T>(url: string, payload: Enrollment | Withdrawal): Promise<ApiResponse<T>> {
    return withSecurityIncidentGuard((async () => {
        try {
            const response = await authFetch(url, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
            });
            return await response.json() as ApiResponse<T>;
        } catch {
            return { error: { code: "PERSISTENCE_FAILED", message: "", retryable: true } };
        }
    })());
}
