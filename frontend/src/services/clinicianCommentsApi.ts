import { authFetch } from "./authService";
import { API_URL } from "./config";
import type { WriteVerificationMeta } from "../types/api";

export type ClinicianComment = {
    id: string;
    actorUserId: string | null;
    actorUsername: string;
    actorRole: string;
    category: "BUG" | "SUGGESTION" | "URGENT" | "INCOMPREHENSION";
    comment: string;
    redactionCount: number;
    redactionTypes: string[];
    createdAt: string;
    replies: Array<{
        id: string;
        responderUserId: string;
        responderUsername: string;
        responderRole: string;
        message: string;
        createdAt: string;
    }>;
    trackingCode?: string;
};

type ClinicianCommentsResponse = {
    data?: {
        items?: ClinicianComment[];
        pagination?: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
        scope?: "own" | "all";
        availableActorUsernames?: string[];
    };
    error?: {
        code?: string;
        message?: string;
    };
    meta?: {
        source?: "real" | "mock" | "degraded";
        model?: string;
        writeVerification?: WriteVerificationMeta;
    };
};

type ClinicianCommentsInboxResponse = {
    data?: {
        items?: ClinicianComment[];
        filters?: {
            actorUsername?: string;
            category?: string;
            replied?: string;
            startDate?: string;
            endDate?: string;
        };
        availableActorUsernames?: string[];
        pagination?: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
        summary?: {
            hasNew?: boolean;
            startDate?: string;
            endDate?: string;
        };
    };
    error?: {
        code?: string;
        message?: string;
    };
};

async function toJson(response: Response): Promise<ClinicianCommentsResponse> {
    try {
        return (await response.json()) as ClinicianCommentsResponse;
    } catch {
        return {};
    }
}

export async function listClinicianComments(
    scope: "own" | "all" = "own",
    actorUsername = "",
    category = ""
) {
    const query = new URLSearchParams({ scope });
    if (actorUsername.trim()) {
        query.set("actorUsername", actorUsername.trim().toLowerCase());
    }
    if (category.trim()) {
        query.set("category", category.trim().toUpperCase());
    }

    const response = await authFetch(`/api/clinician-comments?${query.toString()}`);
    const payload = await toJson(response);

    if (!response.ok || !payload.data) {
        return {
            ok: false as const,
            error: {
                message:
                    payload?.error?.message ||
                    "Impossible de recuperer les commentaires.",
            },
        };
    }

    return {
        ok: true as const,
        data: payload.data,
    };
}

export async function createClinicianComment(
    comment: string,
    category: ClinicianComment["category"],
    guestDisplayName?: string,
    trackingCode?: string
) {
    const response = await authFetch("/api/clinician-comments", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ comment, category, guestDisplayName, trackingCode }),
    });

    const payload = await toJson(response);
    if (!response.ok || !payload.data) {
        return {
            ok: false as const,
            error: {
                message:
                    payload?.error?.message ||
                    "Impossible d'enregistrer le commentaire.",
            },
        };
    }

    return {
        ok: true as const,
        data: payload.data as ClinicianComment,
        meta: payload.meta,
    };
}

export async function lookupClinicianReplies(
    actorUsername: string,
    trackingCode: string
) {
    const query = new URLSearchParams({
        actorUsername: actorUsername.trim().toLowerCase(),
        trackingCode: trackingCode.trim().toUpperCase(),
    });
    const response = await fetch(
        `${API_URL}/api/clinician-comments/lookup-replies?${query.toString()}`
    );
    const payload = await toJson(response);

    if (!response.ok || !payload.data) {
        return {
            ok: false as const,
            error: {
                message:
                    payload?.error?.message ||
                    "Impossible de recuperer les reponses.",
            },
        };
    }

    return {
        ok: true as const,
        data: payload.data,
    };
}

export async function replyToClinicianComment(commentId: string, message: string) {
    const response = await authFetch(`/api/clinician-comments/${commentId}/reply`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
    });

    const payload = await toJson(response);
    if (!response.ok || !payload.data) {
        return {
            ok: false as const,
            error: {
                message:
                    payload?.error?.message ||
                    "Impossible d'enregistrer la reponse.",
            },
        };
    }

    return {
        ok: true as const,
        data: payload.data as ClinicianComment,
        meta: payload.meta,
    };
}

export async function listClinicianCommentsInbox(
    page = 1,
    limit = 10,
    actorUsername = "",
    category = "",
    replied = "",
    startDate = "",
    endDate = ""
) {
    const query = new URLSearchParams({
        page: String(page),
        limit: String(limit),
    });

    if (actorUsername.trim()) {
        query.set("actorUsername", actorUsername.trim().toLowerCase());
    }
    if (category.trim()) {
        query.set("category", category.trim().toUpperCase());
    }
    if (replied.trim()) {
        query.set("replied", replied.trim().toLowerCase());
    }
    if (startDate.trim()) {
        query.set("startDate", startDate.trim());
    }
    if (endDate.trim()) {
        query.set("endDate", endDate.trim());
    }

    const response = await authFetch(`/api/clinician-comments/inbox?${query.toString()}`);
    const payload = (await toJson(response)) as ClinicianCommentsInboxResponse;

    if (!response.ok || !payload.data) {
        return {
            ok: false as const,
            error: {
                code: payload?.error?.code,
                message:
                    payload?.error?.message ||
                    "Impossible de recuperer les nouveaux commentaires.",
            },
        };
    }

    return {
        ok: true as const,
        data: payload.data,
    };
}

export async function acknowledgeClinicianCommentsInbox() {
    const response = await authFetch("/api/clinician-comments/inbox/acknowledge", {
        method: "POST",
    });
    const payload = await toJson(response);

    if (!response.ok || !payload.data) {
        return {
            ok: false as const,
            error: {
                message:
                    payload?.error?.message ||
                    "Impossible de confirmer la lecture des nouveaux commentaires.",
            },
        };
    }

    return {
        ok: true as const,
        data: payload.data,
    };
}
