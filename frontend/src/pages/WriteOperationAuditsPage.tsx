import { useEffect, useMemo, useState } from "react";
import { DatabaseZap, Eye, RefreshCw } from "lucide-react";
import { labels } from "../i18n/uiLabels";
import type { ApiError } from "../types/api";
import {
    fetchWriteOperationAudits,
    type WriteOperationAuditFilters,
    type WriteOperationAuditLog,
    type WriteOperationAuditOperation,
    type WriteOperationAuditOutcome,
    type WriteOperationAuditReplicaStatus,
    type WriteOperationAuditSummary,
} from "../services/writeOperationAuditsApi";
import { useDebounce } from "../hooks/useDebounce";

const LIMIT = 25;

const COLLECTION_OPTIONS = [
    "",
    "patients",
    "appointments",
    "diagnosisresults",
    "cliniciancomments",
    "specialists",
    "cliniques",
    "patientauditlogs",
] as const;

const OPERATION_OPTIONS: Array<"" | WriteOperationAuditOperation> = [
    "",
    "CREATE",
    "READ",
    "UPDATE",
    "DELETE",
    "REPLY",
    "UPSERT",
];

const OUTCOME_OPTIONS: Array<"" | WriteOperationAuditOutcome> = [
    "",
    "SUCCESS",
    "FAILED",
];

const REPLICA_STATUS_OPTIONS: Array<"" | WriteOperationAuditReplicaStatus> = [
    "",
    "OK",
    "DEGRADED",
    "LAGGING",
    "INCIDENT",
    "UNKNOWN",
];

const ACTOR_ROLE_OPTIONS = ["", "USER", "MEDECIN", "ADMIN", "SUPERADMIN"] as const;

function formatTimestamp(value?: string | null) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString("fr-CA");
}

function formatCount(value?: number | null) {
    if (value == null || !Number.isFinite(value)) return "0";
    return new Intl.NumberFormat("fr-CA").format(value);
}

function formatWriteConcern(log: WriteOperationAuditLog) {
    if (!log.writeConcern) return "-";

    const parts = [];
    if (log.writeConcern.w != null) parts.push(`w=${log.writeConcern.w}`);
    if (log.writeConcern.j != null) parts.push(`j=${log.writeConcern.j ? "true" : "false"}`);
    if (log.writeConcern.wtimeout != null) parts.push(`timeout=${log.writeConcern.wtimeout}`);

    return parts.length ? parts.join(" ") : "-";
}

function shortValue(value?: string | null, visibleChars = 8) {
    if (!value) return "-";
    if (value.length <= visibleChars * 2 + 3) return value;
    return `${value.slice(0, visibleChars)}...${value.slice(-visibleChars)}`;
}

function statusTone(status?: string | null) {
    if (status === "OK" || status === "SUCCESS") {
        return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
    }
    if (status === "DEGRADED" || status === "LAGGING") {
        return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
    }
    if (status === "INCIDENT" || status === "FAILED") {
        return "bg-red-50 text-red-700 ring-1 ring-red-200";
    }
    return "bg-slate-50 text-slate-700 ring-1 ring-slate-200";
}

function Pill({ value }: { value?: string | null }) {
    return (
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(value)}`}>
            {value || "-"}
        </span>
    );
}

function SummaryStrip({ summary }: { summary: WriteOperationAuditSummary | null }) {
    const pageLabels = labels.writeOperationAudits;
    const operationSummary = summary?.byOperation || {};
    const replicaSummary = summary?.byReplicaStatus || {};

    return (
        <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="grid grid-cols-1 divide-y divide-gray-100 md:grid-cols-4 md:divide-x md:divide-y-0">
                <div className="p-4">
                    <div className="text-xs font-medium uppercase text-gray-500">{pageLabels.summary.total}</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-950">{formatCount(summary?.total)}</div>
                </div>
                <div className="p-4">
                    <div className="text-xs font-medium uppercase text-gray-500">{pageLabels.summary.operations}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {["CREATE", "UPDATE", "DELETE", "REPLY"].map((operation) => (
                            <span key={operation} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                                {operation}: {formatCount(operationSummary[operation])}
                            </span>
                        ))}
                    </div>
                </div>
                <div className="p-4">
                    <div className="text-xs font-medium uppercase text-gray-500">{pageLabels.summary.replica}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {["OK", "DEGRADED", "LAGGING", "INCIDENT"].map((status) => (
                            <span key={status} className={`rounded px-2 py-1 text-xs ${statusTone(status)}`}>
                                {status}: {formatCount(replicaSummary[status])}
                            </span>
                        ))}
                    </div>
                </div>
                <div className="p-4">
                    <div className="text-xs font-medium uppercase text-gray-500">{pageLabels.summary.majorityUnavailable}</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-950">
                        {formatCount(summary?.majorityUnavailableCount)}
                    </div>
                </div>
            </div>
        </section>
    );
}

export function WriteOperationAuditsPage() {
    const pageLabels = labels.writeOperationAudits;
    const [logs, setLogs] = useState<WriteOperationAuditLog[]>([]);
    const [summary, setSummary] = useState<WriteOperationAuditSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<ApiError | null>(null);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [selectedLog, setSelectedLog] = useState<WriteOperationAuditLog | null>(null);

    const [collectionName, setCollectionName] = useState<(typeof COLLECTION_OPTIONS)[number]>("");
    const [operation, setOperation] = useState<"" | WriteOperationAuditOperation>("");
    const [outcome, setOutcome] = useState<"" | WriteOperationAuditOutcome>("");
    const [replicaStatus, setReplicaStatus] = useState<"" | WriteOperationAuditReplicaStatus>("");
    const [actorRole, setActorRole] = useState<(typeof ACTOR_ROLE_OPTIONS)[number]>("");
    const [majorityAvailable, setMajorityAvailable] = useState<"" | "true" | "false">("");
    const [actorUserId, setActorUserId] = useState("");
    const [resourceId, setResourceId] = useState("");
    const [requestId, setRequestId] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");

    const rawFilters = useMemo<WriteOperationAuditFilters>(
        () => ({
            collectionName,
            operation,
            outcome,
            replicaStatus,
            actorRole,
            majorityAvailable,
            actorUserId: actorUserId.trim() || undefined,
            resourceId: resourceId.trim() || undefined,
            requestId: requestId.trim() || undefined,
            startDate,
            endDate,
        }),
        [
            collectionName,
            operation,
            outcome,
            replicaStatus,
            actorRole,
            majorityAvailable,
            actorUserId,
            resourceId,
            requestId,
            startDate,
            endDate,
        ]
    );

    const filters = useDebounce(rawFilters, 300);

    async function loadAudits() {
        setLoading(true);
        setError(null);

        const response = await fetchWriteOperationAudits({
            ...filters,
            page,
            limit: LIMIT,
        });

        if ("error" in response) {
            setError(response.error);
            setLogs([]);
            setSummary(null);
            setLoading(false);
            return;
        }

        setLogs(response.data.logs);
        setSummary(response.data.summary);
        setSelectedLog((current) => {
            if (!current) return null;
            return response.data.logs.find((log) => log.id === current.id) || null;
        });
        setPage(response.data.pagination.page);
        setTotalPages(response.data.pagination.totalPages);
        setTotal(response.data.pagination.total);
        setLoading(false);
    }

    useEffect(() => {
        void loadAudits();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, page]);

    function resetFilters() {
        setCollectionName("");
        setOperation("");
        setOutcome("");
        setReplicaStatus("");
        setActorRole("");
        setMajorityAvailable("");
        setActorUserId("");
        setResourceId("");
        setRequestId("");
        setStartDate("");
        setEndDate("");
        setPage(1);
    }

    return (
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
            <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <DatabaseZap className="h-5 w-5 text-slate-700" />
                        <h1 className="text-2xl font-semibold text-gray-950">{pageLabels.title}</h1>
                    </div>
                    <p className="mt-2 max-w-3xl text-sm text-gray-600">{pageLabels.description}</p>
                </div>
                <button
                    type="button"
                    onClick={() => void loadAudits()}
                    disabled={loading}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-400"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    {pageLabels.actions.refresh}
                </button>
            </header>

            <SummaryStrip summary={summary} />

            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <label className="text-sm text-gray-700">
                        {pageLabels.filters.collection}
                        <select
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={collectionName}
                            onChange={(event) => {
                                setPage(1);
                                setCollectionName(event.target.value as (typeof COLLECTION_OPTIONS)[number]);
                            }}
                        >
                            {COLLECTION_OPTIONS.map((value) => (
                                <option key={value || "all"} value={value}>
                                    {value || pageLabels.filters.allCollections}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="text-sm text-gray-700">
                        {pageLabels.filters.operation}
                        <select
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={operation}
                            onChange={(event) => {
                                setPage(1);
                                setOperation(event.target.value as "" | WriteOperationAuditOperation);
                            }}
                        >
                            {OPERATION_OPTIONS.map((value) => (
                                <option key={value || "all"} value={value}>
                                    {value || pageLabels.filters.allOperations}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="text-sm text-gray-700">
                        {pageLabels.filters.outcome}
                        <select
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={outcome}
                            onChange={(event) => {
                                setPage(1);
                                setOutcome(event.target.value as "" | WriteOperationAuditOutcome);
                            }}
                        >
                            {OUTCOME_OPTIONS.map((value) => (
                                <option key={value || "all"} value={value}>
                                    {value || pageLabels.filters.allOutcomes}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="text-sm text-gray-700">
                        {pageLabels.filters.replica}
                        <select
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={replicaStatus}
                            onChange={(event) => {
                                setPage(1);
                                setReplicaStatus(event.target.value as "" | WriteOperationAuditReplicaStatus);
                            }}
                        >
                            {REPLICA_STATUS_OPTIONS.map((value) => (
                                <option key={value || "all"} value={value}>
                                    {value || pageLabels.filters.allReplicaStatuses}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="text-sm text-gray-700">
                        {pageLabels.filters.majority}
                        <select
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={majorityAvailable}
                            onChange={(event) => {
                                setPage(1);
                                setMajorityAvailable(event.target.value as "" | "true" | "false");
                            }}
                        >
                            <option value="">{pageLabels.filters.allMajorityStates}</option>
                            <option value="true">{pageLabels.filters.majorityAvailable}</option>
                            <option value="false">{pageLabels.filters.majorityUnavailable}</option>
                        </select>
                    </label>

                    <label className="text-sm text-gray-700">
                        {pageLabels.filters.actorRole}
                        <select
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={actorRole}
                            onChange={(event) => {
                                setPage(1);
                                setActorRole(event.target.value as (typeof ACTOR_ROLE_OPTIONS)[number]);
                            }}
                        >
                            {ACTOR_ROLE_OPTIONS.map((value) => (
                                <option key={value || "all"} value={value}>
                                    {value || pageLabels.filters.allRoles}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="text-sm text-gray-700">
                        {pageLabels.filters.actorUserId}
                        <input
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={actorUserId}
                            onChange={(event) => {
                                setPage(1);
                                setActorUserId(event.target.value);
                            }}
                            placeholder={pageLabels.placeholders.actorUserId}
                        />
                    </label>

                    <label className="text-sm text-gray-700">
                        {pageLabels.filters.resourceId}
                        <input
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={resourceId}
                            onChange={(event) => {
                                setPage(1);
                                setResourceId(event.target.value);
                            }}
                            placeholder={pageLabels.placeholders.resourceId}
                        />
                    </label>

                    <label className="text-sm text-gray-700">
                        {pageLabels.filters.requestId}
                        <input
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={requestId}
                            onChange={(event) => {
                                setPage(1);
                                setRequestId(event.target.value);
                            }}
                            placeholder={pageLabels.placeholders.requestId}
                        />
                    </label>

                    <label className="text-sm text-gray-700">
                        {pageLabels.filters.startDate}
                        <input
                            type="date"
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={startDate}
                            max={endDate || undefined}
                            onChange={(event) => {
                                setPage(1);
                                setStartDate(event.target.value);
                            }}
                        />
                    </label>

                    <label className="text-sm text-gray-700">
                        {pageLabels.filters.endDate}
                        <input
                            type="date"
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={endDate}
                            min={startDate || undefined}
                            onChange={(event) => {
                                setPage(1);
                                setEndDate(event.target.value);
                            }}
                        />
                    </label>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                    <button
                        type="button"
                        onClick={resetFilters}
                        className="rounded border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:border-gray-400"
                    >
                        {pageLabels.actions.reset}
                    </button>
                    <span className="text-gray-500">
                        {loading
                            ? pageLabels.status.loading
                            : `${formatCount(total)} ${pageLabels.status.results}`}
                    </span>
                </div>

                {error && (
                    <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error.message}
                    </div>
                )}
            </section>

            <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-600">
                            <tr>
                                <th className="px-4 py-3">{pageLabels.table.date}</th>
                                <th className="px-4 py-3">{pageLabels.table.collection}</th>
                                <th className="px-4 py-3">{pageLabels.table.operation}</th>
                                <th className="px-4 py-3">{pageLabels.table.actor}</th>
                                <th className="px-4 py-3">{pageLabels.table.replica}</th>
                                <th className="px-4 py-3">{pageLabels.table.writeConcern}</th>
                                <th className="px-4 py-3">{pageLabels.table.resource}</th>
                                <th className="px-4 py-3">{pageLabels.table.changedFields}</th>
                                <th className="px-4 py-3">{pageLabels.table.details}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr>
                                    <td className="px-4 py-6 text-gray-500" colSpan={9}>
                                        {pageLabels.status.loading}
                                    </td>
                                </tr>
                            )}
                            {!loading && logs.length === 0 && (
                                <tr>
                                    <td className="px-4 py-6 text-gray-500" colSpan={9}>
                                        {pageLabels.status.empty}
                                    </td>
                                </tr>
                            )}
                            {!loading && logs.map((log) => (
                                <tr
                                    key={log.id}
                                    className={
                                        "border-t border-gray-100 align-top " +
                                        (selectedLog?.id === log.id ? "bg-slate-50" : "")
                                    }
                                >
                                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                                        {formatTimestamp(log.timestamp)}
                                    </td>
                                    <td className="px-4 py-3 font-medium text-gray-900">
                                        {log.collectionName}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col gap-1">
                                            <Pill value={log.operation} />
                                            <Pill value={log.outcome} />
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-gray-700">
                                        <div className="font-medium">{log.actorUsernameMasked || "unknown"}</div>
                                        <div className="text-xs text-gray-500">{log.actorRole || "-"}</div>
                                    </td>
                                    <td className="px-4 py-3 text-gray-700">
                                        <div className="flex flex-col gap-1">
                                            <Pill value={log.replicaSet?.status || "UNKNOWN"} />
                                            <span className="text-xs text-gray-500">
                                                {log.replicaSet?.healthyCount ?? "-"} / {log.replicaSet?.memberCount ?? "-"} {pageLabels.table.healthy}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                                        {formatWriteConcern(log)}
                                    </td>
                                    <td className="px-4 py-3 text-gray-700">
                                        <span title={log.resourceId || undefined}>{shortValue(log.resourceId)}</span>
                                    </td>
                                    <td className="px-4 py-3 text-gray-700">
                                        {log.changedFields.length > 0 ? (
                                            <div className="flex max-w-64 flex-wrap gap-1">
                                                {log.changedFields.slice(0, 4).map((field) => (
                                                    <span
                                                        key={`${log.id}-${field}`}
                                                        className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700"
                                                    >
                                                        {field}
                                                    </span>
                                                ))}
                                                {log.changedFields.length > 4 && (
                                                    <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                                                        +{log.changedFields.length - 4}
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-gray-400">-</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedLog((current) => current?.id === log.id ? null : log)}
                                            className="inline-flex items-center gap-2 rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-gray-400"
                                        >
                                            <Eye className="h-4 w-4" />
                                            {selectedLog?.id === log.id ? pageLabels.actions.hideDetails : pageLabels.actions.showDetails}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {selectedLog && (
                    <div className="border-t border-gray-200 bg-slate-50 px-4 py-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <h2 className="text-sm font-semibold text-gray-950">
                                {pageLabels.details.title}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setSelectedLog(null)}
                                className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-gray-400"
                            >
                                {pageLabels.actions.closeDetails}
                            </button>
                        </div>
                        <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
                            <div>
                                <dt className="text-xs font-medium uppercase text-gray-500">{pageLabels.details.actorUserId}</dt>
                                <dd className="mt-1 break-all text-gray-900">{selectedLog.actorUserId || "-"}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-medium uppercase text-gray-500">{pageLabels.details.resourceId}</dt>
                                <dd className="mt-1 break-all text-gray-900">{selectedLog.resourceId || "-"}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-medium uppercase text-gray-500">{pageLabels.details.requestId}</dt>
                                <dd className="mt-1 break-all text-gray-900">{selectedLog.requestId || "-"}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-medium uppercase text-gray-500">{pageLabels.details.instanceId}</dt>
                                <dd className="mt-1 break-all text-gray-900">{selectedLog.instanceId || "-"}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-medium uppercase text-gray-500">{pageLabels.details.requestPath}</dt>
                                <dd className="mt-1 break-all text-gray-900">{selectedLog.requestPath || "-"}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-medium uppercase text-gray-500">{pageLabels.details.ip}</dt>
                                <dd className="mt-1 break-all text-gray-900">{selectedLog.ip || "-"}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-medium uppercase text-gray-500">{pageLabels.details.replica}</dt>
                                <dd className="mt-1 text-gray-900">
                                    {selectedLog.replicaSet?.status || "UNKNOWN"} · {selectedLog.replicaSet?.healthyCount ?? "-"} / {selectedLog.replicaSet?.memberCount ?? "-"} · lag {selectedLog.replicaSet?.maxLagSeconds ?? "-"}s
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs font-medium uppercase text-gray-500">{pageLabels.details.majority}</dt>
                                <dd className="mt-1 text-gray-900">
                                    {selectedLog.replicaSet?.majorityAvailable === true
                                        ? pageLabels.filters.majorityAvailable
                                        : selectedLog.replicaSet?.majorityAvailable === false
                                            ? pageLabels.filters.majorityUnavailable
                                            : "-"}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs font-medium uppercase text-gray-500">{pageLabels.details.writeConcern}</dt>
                                <dd className="mt-1 text-gray-900">{formatWriteConcern(selectedLog)}</dd>
                            </div>
                        </dl>
                        <div className="mt-4">
                            <div className="text-xs font-medium uppercase text-gray-500">{pageLabels.details.changedFields}</div>
                            <div className="mt-2 flex flex-wrap gap-1">
                                {selectedLog.changedFields.length > 0 ? selectedLog.changedFields.map((field) => (
                                    <span key={`${selectedLog.id}-detail-${field}`} className="rounded bg-white px-2 py-1 text-xs text-gray-700 ring-1 ring-gray-200">
                                        {field}
                                    </span>
                                )) : <span className="text-sm text-gray-500">-</span>}
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
                    <span>
                        {pageLabels.pagination.page} {page} / {Math.max(1, totalPages)}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setPage((current) => Math.max(current - 1, 1))}
                            disabled={page <= 1 || loading}
                            className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-50"
                        >
                            {pageLabels.pagination.previous}
                        </button>
                        <button
                            type="button"
                            onClick={() => setPage((current) => Math.min(current + 1, Math.max(1, totalPages)))}
                            disabled={page >= totalPages || loading}
                            className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-50"
                        >
                            {pageLabels.pagination.next}
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
}
