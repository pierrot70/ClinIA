import { authFetch, SessionExpiredError } from "./authService";
import type { ApiError, ApiResponse } from "../types/api";

export type WriteOperationAuditOperation =
    | "CREATE"
    | "READ"
    | "UPDATE"
    | "DELETE"
    | "REPLY"
    | "UPSERT";

export type WriteOperationAuditOutcome = "SUCCESS" | "FAILED";

export type WriteOperationAuditReplicaStatus =
    | "OK"
    | "DEGRADED"
    | "LAGGING"
    | "INCIDENT"
    | "UNKNOWN";

export type WriteOperationAuditLog = {
    id: string;
    collectionName: string;
    operation: WriteOperationAuditOperation;
    outcome: WriteOperationAuditOutcome;
    verificationId: string | null;
    clientMutationId: string | null;
    actorUserId: string | null;
    actorUsernameMasked: string;
    actorRole: string | null;
    ip: string | null;
    requestId: string | null;
    instanceId: string | null;
    resourceId: string | null;
    changedFields: string[];
    requestPath: string | null;
    writeConcern: {
        w: string | number | null;
        j: boolean | null;
        wtimeout: number | null;
    } | null;
    replicaSet: {
        status: WriteOperationAuditReplicaStatus;
        memberCount: number | null;
        healthyCount: number | null;
        primaryCount: number | null;
        secondaryCount: number | null;
        majorityAvailable: boolean | null;
        maxLagSeconds: number | null;
        laggingThresholdSeconds: number | null;
        checkedAt: string | null;
    } | null;
    dataClassification: "NO_PATIENT_IDENTIFIERS";
    errorCode: string | null;
    timestamp: string;
};

export type WriteOperationAuditSummary = {
    total: number;
    byCollection: Record<string, number>;
    byOperation: Record<string, number>;
    byOutcome: Record<string, number>;
    byActorRole: Record<string, number>;
    byReplicaStatus: Record<string, number>;
    majorityUnavailableCount: number;
};

export type PaginatedWriteOperationAudits = {
    summary: WriteOperationAuditSummary;
    logs: WriteOperationAuditLog[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
};

export type WriteOperationAuditFilters = {
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    collectionName?: string;
    operation?: WriteOperationAuditOperation | "";
    outcome?: WriteOperationAuditOutcome | "";
    actorUserId?: string;
    actorRole?: "USER" | "MEDECIN" | "ADMIN" | "SUPERADMIN" | "";
    resourceId?: string;
    requestId?: string;
    verificationId?: string;
    clientMutationId?: string;
    replicaStatus?: WriteOperationAuditReplicaStatus | "";
    majorityAvailable?: "true" | "false" | "";
};

async function toApiError(response: Response): Promise<ApiError> {
    const payload = await response.json().catch(() => ({}));
    return {
        code: payload?.error?.code || "INTERNAL_ERROR",
        message: payload?.error?.message || "La requete a echoue.",
        retryable: payload?.error?.retryable ?? true,
    } as ApiError;
}

export async function fetchWriteOperationAudits(
    params: WriteOperationAuditFilters
): Promise<ApiResponse<PaginatedWriteOperationAudits>> {
    const query = new URLSearchParams();

    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.startDate) query.set("startDate", params.startDate);
    if (params.endDate) query.set("endDate", params.endDate);
    if (params.collectionName) query.set("collectionName", params.collectionName);
    if (params.operation) query.set("operation", params.operation);
    if (params.outcome) query.set("outcome", params.outcome);
    if (params.actorUserId) query.set("actorUserId", params.actorUserId);
    if (params.actorRole) query.set("actorRole", params.actorRole);
    if (params.resourceId) query.set("resourceId", params.resourceId);
    if (params.requestId) query.set("requestId", params.requestId);
    if (params.verificationId) query.set("verificationId", params.verificationId);
    if (params.clientMutationId) query.set("clientMutationId", params.clientMutationId);
    if (params.replicaStatus) query.set("replicaStatus", params.replicaStatus);
    if (params.majorityAvailable) {
        query.set("majorityAvailable", params.majorityAvailable);
    }

    try {
        const response = await authFetch(
            `/api/write-operation-audits${query.toString() ? `?${query.toString()}` : ""}`
        );

        if (!response.ok) {
            return { error: await toApiError(response) };
        }

        return (await response.json()) as ApiResponse<PaginatedWriteOperationAudits>;
    } catch (err) {
        if (err instanceof SessionExpiredError) {
            return {
                error: {
                    code: "INTERNAL_ERROR",
                    message: "Session expiree.",
                    retryable: false,
                },
            };
        }

        return {
            error: {
                code: "INTERNAL_ERROR",
                message: "Erreur reseau lors du chargement des audits BD.",
                retryable: true,
            },
        };
    }
}
