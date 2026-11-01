import { authFetch } from "./authService";

export interface ConsultationSummary { _id: string; date: string; time: string; status: string; patient?: { nom: string; prenom: string } }
export interface ConsultationDetail {
    patient: { _id: string; nom: string; prenom: string };
    appointment: ConsultationSummary;
    notes: {
        _id: string; note: string; authorUserId: string; author: string; createdAt: string;
        source?: "CONSULTATION" | "SHARED";
        appointmentId?: string | null;
        authorRole?: "MEDECIN" | null;
        authorSpecialty?: string | null;
    }[];
    legacyNote: string;
    fullHistory: boolean;
    sharedNotesTruncated?: boolean;
    canAddNote: boolean;
    canAcceptCare: boolean;
    inCare: boolean;
}
export async function consultationRequest<T>(path = "", body?: object): Promise<T> {
    const response = await authFetch(`/api/consultations${path}`, body === undefined ? undefined : {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("CONSULTATION_REQUEST_FAILED");
    return (await response.json()).data;
}
