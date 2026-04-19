import { authFetch } from "./authService";

export type ClinicianComment = {
    id: string;
    actorUserId: string | null;
    actorUsername: string;
    actorRole: string;
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
    actorUsername = ""
) {
    const query = new URLSearchParams({ scope });
    if (actorUsername.trim()) {
        query.set("actorUsername", actorUsername.trim().toLowerCase());
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

export async function createClinicianComment(comment: string, guestDisplayName?: string) {
    const response = await authFetch("/api/clinician-comments", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ comment, guestDisplayName }),
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
    };
}
