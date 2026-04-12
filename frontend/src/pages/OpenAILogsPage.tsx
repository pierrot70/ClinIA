import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
    exportOpenAILogsCsv,
    fetchOpenAILogs,
    type OpenAILogEntry,
} from "../services/openaiLogsApi";
import type { ApiError } from "../types/api";

const ACTION_OPTIONS = ["", "AI_ANALYZE_REQUEST"] as const;
const OUTCOME_OPTIONS = ["", "SENT", "SUCCESS", "FAILED"] as const;
const ROLE_OPTIONS = ["", "USER", "MEDECIN", "ADMIN", "SUPERADMIN"] as const;
const CLASSIFICATION_OPTIONS = ["", "ANONYMIZED_MEDICAL"] as const;
const NEUTRALIZED_OPTIONS = ["", "true", "false"] as const;
const ERROR_CODE_OPTIONS = [
    "",
    "PRE_CLOUD_IDENTIFIER_DETECTED",
    "POST_CLOUD_IDENTIFIER_DETECTED",
    "OPENAI_UPSTREAM_FAILED",
    "OPENAI_INVALID_RESPONSE",
    "SECURITY_IDENTIFIER_DETECTED",
] as const;
const PAGE_LIMIT = 20;

function getLocalDateInputValue() {
    const now = new Date();
    const timezoneOffsetMs = now.getTimezoneOffset() * 60 * 1000;
    return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
}

function formatTimestamp(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

function formatRequestContext(context: OpenAILogEntry["requestContext"]) {
    if (!context || Object.keys(context).length === 0) {
        return "-";
    }

    return Object.entries(context)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(" | ");
}

function downloadBlob(blob: Blob, fileName: string) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}

export function OpenAILogsPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [logs, setLogs] = useState<OpenAILogEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState<ApiError | null>(null);
    const [exportError, setExportError] = useState<string | null>(null);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [exportTruncated, setExportTruncated] = useState(false);

    const filters = useMemo(() => {
        const pageValue = Number.parseInt(searchParams.get("page") || "1", 10);
        return {
            page: Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1,
            limit: PAGE_LIMIT,
            startDate: searchParams.get("startDate") || "",
            endDate: searchParams.get("endDate") || "",
            action: searchParams.get("action") || "",
            outcome: searchParams.get("outcome") || "",
            actorUserId: searchParams.get("actorUserId") || "",
            actorUsernameMasked: searchParams.get("actorUsernameMasked") || "",
            actorRole: searchParams.get("actorRole") || "",
            ip: searchParams.get("ip") || "",
            requestPath: searchParams.get("requestPath") || "",
            transport: searchParams.get("transport") || "",
            model: searchParams.get("model") || "",
            payloadHash: searchParams.get("payloadHash") || "",
            payloadSizeBytes: searchParams.get("payloadSizeBytes") || "",
            dataClassification: searchParams.get("dataClassification") || "",
            acknowledgmentIncidentId:
                searchParams.get("acknowledgmentIncidentId") || "",
            neutralized: searchParams.get("neutralized") || "",
            upstreamRequestId: searchParams.get("upstreamRequestId") || "",
            errorCode: searchParams.get("errorCode") || "",
        };
    }, [searchParams]);

    const [draftFilters, setDraftFilters] = useState(filters);

    useEffect(() => {
        setDraftFilters(filters);
    }, [filters]);

    useEffect(() => {
        void loadLogs();
    }, [filters]);

    async function loadLogs() {
        setLoading(true);
        setError(null);

        const response = await fetchOpenAILogs(filters);

        if ("error" in response) {
            setError(response.error);
            setLogs([]);
            setLoading(false);
            return;
        }

        setLogs(response.data.logs);
        setTotalPages(response.data.pagination.totalPages);
        setTotal(response.data.pagination.total);
        setLoading(false);
    }

    function updateDraftFilter(name: keyof typeof draftFilters, value: string) {
        setDraftFilters((current) => ({
            ...current,
            [name]: value,
        }));
    }

    function setPage(page: number) {
        const next = new URLSearchParams(searchParams);
        next.set("page", String(page));
        setSearchParams(next);
    }

    function resetFilters() {
        setDraftFilters({
            page: 1,
            limit: PAGE_LIMIT,
            startDate: "",
            endDate: "",
            action: "",
            outcome: "",
            actorUserId: "",
            actorUsernameMasked: "",
            actorRole: "",
            ip: "",
            requestPath: "",
            transport: "",
            model: "",
            payloadHash: "",
            payloadSizeBytes: "",
            dataClassification: "",
            acknowledgmentIncidentId: "",
            neutralized: "",
            upstreamRequestId: "",
            errorCode: "",
        });
        setSearchParams({ page: "1" });
        setExportTruncated(false);
        setExportError(null);
    }

    function applyFilters() {
        const next = new URLSearchParams();

        Object.entries(draftFilters).forEach(([key, value]) => {
            if (key === "page" || key === "limit") {
                return;
            }

            const normalized = String(value ?? "").trim();
            if (normalized) {
                next.set(key, normalized);
            }
        });

        next.set("page", "1");
        setSearchParams(next);
    }

    function applyRecentClinicalErrorsPreset() {
        const today = getLocalDateInputValue();
        const nextFilters = {
            ...draftFilters,
            startDate: today,
            endDate: today,
            action: "AI_ANALYZE_REQUEST",
            outcome: "FAILED",
            requestPath: "/api/ai/analyze",
        };

        setDraftFilters(nextFilters);

        const next = new URLSearchParams();
        Object.entries(nextFilters).forEach(([key, value]) => {
            if (key === "page" || key === "limit") {
                return;
            }

            const normalized = String(value ?? "").trim();
            if (normalized) {
                next.set(key, normalized);
            }
        });

        next.set("page", "1");
        setSearchParams(next);
    }

    async function handleExportCsv() {
        setExporting(true);
        setExportError(null);

        try {
            const { blob, truncated } = await exportOpenAILogsCsv({
                ...filters,
                page: undefined,
                limit: undefined,
            });
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            downloadBlob(blob, `openai-logs-${timestamp}.csv`);
            setExportTruncated(truncated);
        } catch (err) {
            setExportError(err instanceof Error ? err.message : "Impossible d'exporter le CSV.");
        } finally {
            setExporting(false);
        }
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
            <header className="space-y-2">
                <h1 className="text-2xl font-semibold text-gray-900">OpenAI logs</h1>
                <p className="text-sm text-gray-600 max-w-4xl">
                    Consultez les requetes anonymisees envoyees a OpenAI, avec filtres persistants dans l'URL et export CSV base sur les memes criteres.
                </p>
            </header>

            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <label className="text-sm text-gray-700">
                        Action
                        <select
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={draftFilters.action}
                            onChange={(event) => updateDraftFilter("action", event.target.value)}
                        >
                            {ACTION_OPTIONS.map((option) => (
                                <option key={option || "all-actions"} value={option}>
                                    {option || "Toutes"}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="text-sm text-gray-700">
                        Resultat
                        <select
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={draftFilters.outcome}
                            onChange={(event) => updateDraftFilter("outcome", event.target.value)}
                        >
                            {OUTCOME_OPTIONS.map((option) => (
                                <option key={option || "all-outcomes"} value={option}>
                                    {option || "Tous"}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="text-sm text-gray-700">
                        Username masque
                        <input
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={draftFilters.actorUsernameMasked}
                            onChange={(event) => updateDraftFilter("actorUsernameMasked", event.target.value)}
                            placeholder="Ex: ad***"
                        />
                    </label>

                    <label className="text-sm text-gray-700">
                        Role
                        <select
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={draftFilters.actorRole}
                            onChange={(event) => updateDraftFilter("actorRole", event.target.value)}
                        >
                            {ROLE_OPTIONS.map((option) => (
                                <option key={option || "all-roles"} value={option}>
                                    {option || "Tous"}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="text-sm text-gray-700">
                        Actor user ID
                        <input
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={draftFilters.actorUserId}
                            onChange={(event) => updateDraftFilter("actorUserId", event.target.value)}
                            placeholder="507f..."
                        />
                    </label>

                    <label className="text-sm text-gray-700">
                        IP
                        <input
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={draftFilters.ip}
                            onChange={(event) => updateDraftFilter("ip", event.target.value)}
                            placeholder="203.0.113"
                        />
                    </label>

                    <label className="text-sm text-gray-700">
                        Request path
                        <input
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={draftFilters.requestPath}
                            onChange={(event) => updateDraftFilter("requestPath", event.target.value)}
                            placeholder="/api/ai/analyze"
                        />
                    </label>

                    <label className="text-sm text-gray-700">
                        Transport
                        <input
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={draftFilters.transport}
                            onChange={(event) => updateDraftFilter("transport", event.target.value)}
                            placeholder="openai_chat_completions"
                        />
                    </label>

                    <label className="text-sm text-gray-700">
                        Modele
                        <input
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={draftFilters.model}
                            onChange={(event) => updateDraftFilter("model", event.target.value)}
                            placeholder="gpt-4.1-mini"
                        />
                    </label>

                    <label className="text-sm text-gray-700">
                        Payload hash
                        <input
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={draftFilters.payloadHash}
                            onChange={(event) => updateDraftFilter("payloadHash", event.target.value)}
                            placeholder="abc123"
                        />
                    </label>

                    <label className="text-sm text-gray-700">
                        Payload size bytes
                        <input
                            type="number"
                            min="0"
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={draftFilters.payloadSizeBytes}
                            onChange={(event) => updateDraftFilter("payloadSizeBytes", event.target.value)}
                        />
                    </label>

                    <label className="text-sm text-gray-700">
                        Classification
                        <select
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={draftFilters.dataClassification}
                            onChange={(event) => updateDraftFilter("dataClassification", event.target.value)}
                        >
                            {CLASSIFICATION_OPTIONS.map((option) => (
                                <option key={option || "all-classifications"} value={option}>
                                    {option || "Toutes"}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="text-sm text-gray-700">
                        Incident ack id
                        <input
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={draftFilters.acknowledgmentIncidentId}
                            onChange={(event) => updateDraftFilter("acknowledgmentIncidentId", event.target.value)}
                            placeholder="507f..."
                        />
                    </label>

                    <label className="text-sm text-gray-700">
                        Neutralized
                        <select
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={draftFilters.neutralized}
                            onChange={(event) => updateDraftFilter("neutralized", event.target.value)}
                        >
                            {NEUTRALIZED_OPTIONS.map((option) => (
                                <option key={option || "all-neutralized"} value={option}>
                                    {option || "Tous"}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="text-sm text-gray-700">
                        Upstream request id
                        <input
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={draftFilters.upstreamRequestId}
                            onChange={(event) => updateDraftFilter("upstreamRequestId", event.target.value)}
                            placeholder="req_123"
                        />
                    </label>

                    <label className="text-sm text-gray-700">
                        Error code
                        <select
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={draftFilters.errorCode}
                            onChange={(event) => updateDraftFilter("errorCode", event.target.value)}
                        >
                            {ERROR_CODE_OPTIONS.map((option) => (
                                <option key={option || "all-error-codes"} value={option}>
                                    {option || "Tous"}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="text-sm text-gray-700">
                        Date debut
                        <input
                            type="date"
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={draftFilters.startDate}
                            max={draftFilters.endDate || undefined}
                            onChange={(event) => updateDraftFilter("startDate", event.target.value)}
                        />
                    </label>

                    <label className="text-sm text-gray-700">
                        Date fin
                        <input
                            type="date"
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={draftFilters.endDate}
                            min={draftFilters.startDate || undefined}
                            onChange={(event) => updateDraftFilter("endDate", event.target.value)}
                        />
                    </label>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm">
                    <button
                        type="button"
                        onClick={applyFilters}
                        className="rounded bg-gray-900 px-4 py-2 font-medium text-white hover:bg-gray-800"
                    >
                        Rechercher
                    </button>
                    <button
                        type="button"
                        onClick={applyRecentClinicalErrorsPreset}
                        className="rounded border border-amber-300 bg-amber-50 px-4 py-2 font-medium text-amber-900 hover:bg-amber-100"
                    >
                        Afficher seulement les erreurs cliniques recentes
                    </button>
                    <button
                        type="button"
                        onClick={() => void loadLogs()}
                        className="rounded border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:border-gray-400"
                    >
                        Actualiser
                    </button>
                    <button
                        type="button"
                        onClick={resetFilters}
                        className="rounded border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:border-gray-400"
                    >
                        Reinitialiser
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleExportCsv()}
                        disabled={exporting}
                        className="rounded border border-emerald-300 bg-emerald-50 px-4 py-2 font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                    >
                        {exporting ? "Export CSV..." : "Exporter CSV"}
                    </button>
                    <span className="text-gray-500">
                        {loading ? "Chargement..." : `${total} log${total > 1 ? "s" : ""}`}
                    </span>
                </div>

                {error && (
                    <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error.message}
                    </div>
                )}

                {exportError && (
                    <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {exportError}
                    </div>
                )}

                {exportTruncated && (
                    <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        L'export CSV a ete tronque a 10000 lignes maximum.
                    </div>
                )}
            </section>

            <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-600">
                            <tr>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3">Action</th>
                                <th className="px-4 py-3">Resultat</th>
                                <th className="px-4 py-3">Acteur</th>
                                <th className="px-4 py-3">IP</th>
                                <th className="px-4 py-3">Modele</th>
                                <th className="px-4 py-3">Payload</th>
                                <th className="px-4 py-3">Classification</th>
                                <th className="px-4 py-3">Contexte</th>
                                <th className="px-4 py-3">Route</th>
                                <th className="px-4 py-3">Erreur</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr>
                                    <td className="px-4 py-6 text-gray-500" colSpan={11}>
                                        Chargement des journaux OpenAI...
                                    </td>
                                </tr>
                            )}

                            {!loading && logs.length === 0 && (
                                <tr>
                                    <td className="px-4 py-6 text-gray-500" colSpan={11}>
                                        Aucun journal OpenAI trouve.
                                    </td>
                                </tr>
                            )}

                            {!loading &&
                                logs.map((log) => (
                                    <tr key={log.id} className="border-t border-gray-100 align-top">
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                                            {formatTimestamp(log.timestamp)}
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">{log.action}</td>
                                        <td className="px-4 py-3 text-gray-700">
                                            <span className="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 border border-sky-200">
                                                {log.outcome}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">
                                            <div>{log.actorUsernameMasked || "unknown"}</div>
                                            <div className="text-xs text-gray-500">{log.actorRole || "-"}</div>
                                            <div className="text-xs text-gray-500 break-all">{log.actorUserId || "-"}</div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{log.ip || "-"}</td>
                                        <td className="px-4 py-3 text-gray-700">{log.model || "-"}</td>
                                        <td className="px-4 py-3 text-gray-700">
                                            <div className="break-all">{log.payloadHash || "-"}</div>
                                            <div className="text-xs text-gray-500">{log.payloadSizeBytes} B</div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">
                                            <div>{log.dataClassification || "-"}</div>
                                            <div className="text-xs text-gray-500">
                                                Neutralise: {log.neutralized ? "Oui" : "Non"}
                                            </div>
                                            <div className="text-xs text-gray-500 break-all">
                                                {log.acknowledgmentIncidentId || "-"}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700 max-w-[260px]">{formatRequestContext(log.requestContext)}</td>
                                        <td className="px-4 py-3 text-gray-700 break-all">
                                            <div>{log.requestPath || "-"}</div>
                                            <div className="text-xs text-gray-500">{log.transport || "-"}</div>
                                            <div className="text-xs text-gray-500 break-all">{log.upstreamRequestId || "-"}</div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">{log.errorCode || "-"}</td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
                    <span>
                        Page {filters.page} / {Math.max(1, totalPages)}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setPage(Math.max(filters.page - 1, 1))}
                            disabled={filters.page <= 1 || loading}
                            className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-50"
                        >
                            Precedent
                        </button>
                        <button
                            type="button"
                            onClick={() => setPage(Math.min(filters.page + 1, Math.max(1, totalPages)))}
                            disabled={filters.page >= totalPages || loading}
                            className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-50"
                        >
                            Suivant
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
}
