import React, { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { useTranslation } from "../hooks/useTranslation";
import { labels } from "../i18n/uiLabels";
import { SessionExpiredError } from "../services/authService";

type OpenAILogEntry = {
    id: string;
    action: string;
    outcome: string;
    actorUserId: string | null;
    actorUsernameMasked: string;
    actorRole: string | null;
    ip: string | null;
    requestPath: string;
    transport: string;
    model: string;
    payloadHash: string;
    payloadSizeBytes: number;
    dataClassification: string;
    acknowledgmentIncidentId: string | null;
    neutralized: boolean;
    upstreamRequestId: string | null;
    errorCode: string | null;
    requestContext: Record<string, unknown> | null;
    timestamp: string;
};

type OpenAILogPagination = {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
};

type OpenAILogFilters = {
    startDate: string;
    endDate: string;
    action: string;
    outcome: string;
    actorUserId: string;
    actorUsernameMasked: string;
    actorRole: string;
    ip: string;
    requestPath: string;
    transport: string;
    model: string;
    payloadHash: string;
    payloadSizeBytes: string;
    dataClassification: string;
    acknowledgmentIncidentId: string;
    neutralized: string;
    upstreamRequestId: string;
    errorCode: string;
};

type OpenAILogsModalProps = {
    isOpen: boolean;
    onClose: () => void;
    authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    onSessionExpired: () => void;
};

const EMPTY_FILTERS: OpenAILogFilters = {
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
};

const ACTION_OPTIONS = ["", "AI_ANALYZE_REQUEST"];
const OUTCOME_OPTIONS = ["", "SENT", "SUCCESS", "FAILED"];
const ROLE_OPTIONS = ["", "USER", "MEDECIN", "ADMIN", "SUPERADMIN"];
const CLASSIFICATION_OPTIONS = ["", "ANONYMIZED_MEDICAL"];
const NEUTRALIZED_OPTIONS = ["", "true", "false"];
const ERROR_CODE_OPTIONS = [
    "",
    "PRE_CLOUD_IDENTIFIER_DETECTED",
    "POST_CLOUD_IDENTIFIER_DETECTED",
    "OPENAI_UPSTREAM_FAILED",
    "OPENAI_INVALID_RESPONSE",
    "SECURITY_IDENTIFIER_DETECTED",
];

function useOpenAiLogsModalLabels(targetLang: string) {
    const source = labels.openAiLogs;
    const options = { targetLang, namespace: "openai-logs-modal" };
    const entries = {
        title: source.title,
        modalDescription: source.modalDescription,
        openDedicatedPage: source.openDedicatedPage,
        queryTimePrefix: source.queryTimePrefix,
        close: source.close,
        startDate: source.filters.startDate,
        endDate: source.filters.endDate,
        action: source.filters.action,
        result: source.filters.result,
        actorUserId: source.filters.actorUserId,
        maskedUsername: source.filters.maskedUsername,
        role: source.filters.role,
        ip: source.filters.ip,
        requestPath: source.filters.requestPath,
        transport: source.filters.transport,
        model: source.filters.model,
        payloadHash: source.filters.payloadHash,
        payloadSizeBytes: source.filters.payloadSizeBytes,
        classification: source.filters.classification,
        incidentAckId: source.filters.incidentAckId,
        neutralized: source.filters.neutralized,
        upstreamRequestId: source.filters.upstreamRequestId,
        errorCode: source.filters.errorCode,
        all: source.filters.all,
        allFeminine: source.filters.allFeminine,
        search: source.actions.search,
        recentClinicalErrors: source.actions.recentClinicalErrors,
        reset: source.actions.reset,
        loadingLogs: source.status.loadingLogs,
        noResult: source.status.noResult,
        invalidDateRange: source.status.invalidDateRange,
        loadFailed: source.status.loadFailed,
        networkLoadFailed: source.status.networkLoadFailed,
        unknownTimestamp: source.status.unknownTimestamp,
        invalidTimestamp: source.status.invalidTimestamp,
        yes: source.status.yes,
        no: source.status.no,
        bytesSuffix: source.status.bytesSuffix,
        date: source.table.date,
        tableAction: source.table.action,
        tableResult: source.table.result,
        user: source.table.user,
        tableRole: source.table.role,
        tableIp: source.table.ip,
        tableModel: source.table.model,
        tableNeutralized: source.table.neutralized,
        payload: source.table.payload,
        path: source.table.path,
        tableTransport: source.table.transport,
        tableClassification: source.table.classification,
        upstream: source.table.upstream,
        error: source.table.error,
        context: source.table.context,
        first: source.pagination.first,
        previousSymbol: source.pagination.previousSymbol,
        nextSymbol: source.pagination.nextSymbol,
        last: source.pagination.last,
        pagePrefix: source.pagination.pagePrefix,
        pageSeparator: source.pagination.pageSeparator,
        dashSeparator: source.pagination.dashSeparator,
        resultSuffix: source.pagination.resultSuffix,
    };

    return Object.fromEntries(
        Object.entries(entries).map(([key, text]) => [
            key,
            useTranslation({ text, ...options }).translated,
        ])
    ) as Record<keyof typeof entries, string>;
}

function getLocalDateInputValue() {
    const now = new Date();
    const timezoneOffsetMs = now.getTimezoneOffset() * 60 * 1000;
    return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
}

function formatTimestamp(value: string, labelsText: { unknownTimestamp: string; invalidTimestamp: string }) {
    if (!value) {
        return labelsText.unknownTimestamp;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return labelsText.invalidTimestamp;
    }

    return date.toLocaleString();
}

function formatRequestContext(context: Record<string, unknown> | null) {
    if (!context || Object.keys(context).length === 0) {
        return "-";
    }

    return Object.entries(context)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(" | ");
}

export function OpenAILogsModal({
    isOpen,
    onClose,
    authFetch,
    onSessionExpired,
}: OpenAILogsModalProps) {
    const i18n = useContext(HomeI18nContext) || { locale: "fr" };
    const modalLabels = useOpenAiLogsModalLabels(i18n.locale);
    const [filters, setFilters] = useState<OpenAILogFilters>(EMPTY_FILTERS);
    const [logs, setLogs] = useState<OpenAILogEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState<OpenAILogPagination>({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1,
    });
    const [queryDurationMs, setQueryDurationMs] = useState<number | null>(null);

    async function loadLogs(
        targetPage = 1,
        showLoadingState = true,
        activeFilters: OpenAILogFilters = filters
    ) {
        const startedAt = performance.now();

        if (showLoadingState) {
            setLoading(true);
        }

        setError(null);

        if (
            activeFilters.startDate &&
            activeFilters.endDate &&
            activeFilters.startDate > activeFilters.endDate
        ) {
            setError(modalLabels.invalidDateRange);
            setLogs([]);
            setPagination((current) => ({ ...current, page: 1, total: 0, totalPages: 1 }));
            setQueryDurationMs(null);
            if (showLoadingState) {
                setLoading(false);
            }
            return;
        }

        try {
            const query = new URLSearchParams({
                page: String(targetPage),
                limit: "20",
            });

            (Object.entries(activeFilters) as Array<[keyof OpenAILogFilters, string]>).forEach(
                ([key, value]) => {
                    if (value.trim()) {
                        query.set(key, value.trim());
                    }
                }
            );

            const response = await authFetch(`/api/openai-logs?${query.toString()}`);
            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                setError(
                    payload?.error?.message ||
                        modalLabels.loadFailed
                );
                setLogs([]);
                setQueryDurationMs(Math.round(performance.now() - startedAt));
                return;
            }

            const nextLogs = payload?.data?.logs || [];
            const nextPagination = payload?.data?.pagination || {
                page: targetPage,
                limit: 20,
                total: nextLogs.length,
                totalPages: 1,
            };

            setLogs(nextLogs);
            setPagination(nextPagination);
            setPage(nextPagination.page || targetPage);
            setQueryDurationMs(Math.round(performance.now() - startedAt));
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                onSessionExpired();
                return;
            }

            setError(modalLabels.networkLoadFailed);
            setLogs([]);
            setQueryDurationMs(Math.round(performance.now() - startedAt));
        } finally {
            if (showLoadingState) {
                setLoading(false);
            }
        }
    }

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        void loadLogs(1, true);
    }, [isOpen]);

    function applyRecentClinicalErrorsPreset() {
        const today = getLocalDateInputValue();
        const nextFilters = {
            ...filters,
            startDate: today,
            endDate: today,
            action: "AI_ANALYZE_REQUEST",
            outcome: "FAILED",
            requestPath: "/api/ai/analyze",
        };

        setFilters(nextFilters);
        setPage(1);
        void loadLogs(1, true, nextFilters);
    }

    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/40 px-4 py-4 sm:py-6">
            <div className="mx-auto flex min-h-full w-full max-w-7xl items-start sm:items-center">
                <div className="w-full max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl bg-white p-5 shadow-2xl sm:max-h-[calc(100vh-3rem)]">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">{modalLabels.title}</h2>
                            <p className="text-xs text-gray-500">
                                {modalLabels.modalDescription}
                            </p>
                            <Link
                                to="/admin/openai-logs"
                                onClick={onClose}
                                className="mt-2 inline-flex text-xs font-medium text-sky-700 hover:text-sky-800"
                            >
                                {modalLabels.openDedicatedPage}
                            </Link>
                        </div>
                        <div className="flex items-center gap-3">
                            {queryDurationMs !== null && (
                                <span className="text-xs text-gray-500">
                                    {modalLabels.queryTimePrefix} {queryDurationMs} ms
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                            >
                                {modalLabels.close}
                            </button>
                        </div>
                    </div>

                    <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <label className="text-sm text-gray-700">
                            {modalLabels.startDate}
                            <input
                                type="date"
                                value={filters.startDate}
                                max={filters.endDate || undefined}
                                onChange={(event) => setFilters((current) => ({
                                    ...current,
                                    startDate: event.target.value,
                                }))}
                                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                        </label>
                        <label className="text-sm text-gray-700">
                            {modalLabels.endDate}
                            <input
                                type="date"
                                value={filters.endDate}
                                min={filters.startDate || undefined}
                                onChange={(event) => setFilters((current) => ({
                                    ...current,
                                    endDate: event.target.value,
                                }))}
                                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                        </label>
                        <label className="text-sm text-gray-700">
                            {modalLabels.action}
                            <select
                                value={filters.action}
                                onChange={(event) => setFilters((current) => ({
                                    ...current,
                                    action: event.target.value,
                                }))}
                                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                            >
                                {ACTION_OPTIONS.map((option) => (
                                    <option key={option || "ALL_ACTIONS"} value={option}>
                                        {option || modalLabels.allFeminine}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="text-sm text-gray-700">
                            {modalLabels.result}
                            <select
                                value={filters.outcome}
                                onChange={(event) => setFilters((current) => ({
                                    ...current,
                                    outcome: event.target.value,
                                }))}
                                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                            >
                                {OUTCOME_OPTIONS.map((option) => (
                                    <option key={option || "ALL_OUTCOMES"} value={option}>
                                        {option || modalLabels.all}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="text-sm text-gray-700">
                            {modalLabels.actorUserId}
                            <input
                                type="text"
                                value={filters.actorUserId}
                                onChange={(event) => setFilters((current) => ({
                                    ...current,
                                    actorUserId: event.target.value,
                                }))}
                                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                        </label>
                        <label className="text-sm text-gray-700">
                            {modalLabels.maskedUsername}
                            <input
                                type="text"
                                value={filters.actorUsernameMasked}
                                onChange={(event) => setFilters((current) => ({
                                    ...current,
                                    actorUsernameMasked: event.target.value,
                                }))}
                                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                        </label>
                        <label className="text-sm text-gray-700">
                            {modalLabels.role}
                            <select
                                value={filters.actorRole}
                                onChange={(event) => setFilters((current) => ({
                                    ...current,
                                    actorRole: event.target.value,
                                }))}
                                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                            >
                                {ROLE_OPTIONS.map((option) => (
                                    <option key={option || "ALL_ROLES"} value={option}>
                                        {option || modalLabels.all}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="text-sm text-gray-700">
                            IP
                            <input
                                type="text"
                                value={filters.ip}
                                onChange={(event) => setFilters((current) => ({
                                    ...current,
                                    ip: event.target.value,
                                }))}
                                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                        </label>
                        <label className="text-sm text-gray-700">
                            {modalLabels.requestPath}
                            <input
                                type="text"
                                value={filters.requestPath}
                                onChange={(event) => setFilters((current) => ({
                                    ...current,
                                    requestPath: event.target.value,
                                }))}
                                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                        </label>
                        <label className="text-sm text-gray-700">
                            Transport
                            <input
                                type="text"
                                value={filters.transport}
                                onChange={(event) => setFilters((current) => ({
                                    ...current,
                                    transport: event.target.value,
                                }))}
                                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                        </label>
                        <label className="text-sm text-gray-700">
                            {modalLabels.model}
                            <input
                                type="text"
                                value={filters.model}
                                onChange={(event) => setFilters((current) => ({
                                    ...current,
                                    model: event.target.value,
                                }))}
                                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                        </label>
                        <label className="text-sm text-gray-700">
                            {modalLabels.payloadHash}
                            <input
                                type="text"
                                value={filters.payloadHash}
                                onChange={(event) => setFilters((current) => ({
                                    ...current,
                                    payloadHash: event.target.value,
                                }))}
                                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                        </label>
                        <label className="text-sm text-gray-700">
                            {modalLabels.payloadSizeBytes}
                            <input
                                type="number"
                                min="0"
                                value={filters.payloadSizeBytes}
                                onChange={(event) => setFilters((current) => ({
                                    ...current,
                                    payloadSizeBytes: event.target.value,
                                }))}
                                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                        </label>
                        <label className="text-sm text-gray-700">
                            {modalLabels.classification}
                            <select
                                value={filters.dataClassification}
                                onChange={(event) => setFilters((current) => ({
                                    ...current,
                                    dataClassification: event.target.value,
                                }))}
                                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                            >
                                {CLASSIFICATION_OPTIONS.map((option) => (
                                    <option key={option || "ALL_CLASSIFICATIONS"} value={option}>
                                        {option || modalLabels.allFeminine}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="text-sm text-gray-700">
                            {modalLabels.incidentAckId}
                            <input
                                type="text"
                                value={filters.acknowledgmentIncidentId}
                                onChange={(event) => setFilters((current) => ({
                                    ...current,
                                    acknowledgmentIncidentId: event.target.value,
                                }))}
                                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                        </label>
                        <label className="text-sm text-gray-700">
                            {modalLabels.neutralized}
                            <select
                                value={filters.neutralized}
                                onChange={(event) => setFilters((current) => ({
                                    ...current,
                                    neutralized: event.target.value,
                                }))}
                                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                            >
                                {NEUTRALIZED_OPTIONS.map((option) => (
                                    <option key={option || "ALL_NEUTRALIZED"} value={option}>
                                        {option || modalLabels.all}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="text-sm text-gray-700">
                            {modalLabels.upstreamRequestId}
                            <input
                                type="text"
                                value={filters.upstreamRequestId}
                                onChange={(event) => setFilters((current) => ({
                                    ...current,
                                    upstreamRequestId: event.target.value,
                                }))}
                                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                        </label>
                        <label className="text-sm text-gray-700">
                            {modalLabels.errorCode}
                            <select
                                value={filters.errorCode}
                                onChange={(event) => setFilters((current) => ({
                                    ...current,
                                    errorCode: event.target.value,
                                }))}
                                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                            >
                                {ERROR_CODE_OPTIONS.map((option) => (
                                    <option key={option || "ALL_ERROR_CODES"} value={option}>
                                        {option || modalLabels.all}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <div className="mb-4 flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                void loadLogs(1, true, filters);
                            }}
                            className="rounded bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
                        >
                            {modalLabels.search}
                        </button>
                        <button
                            type="button"
                            onClick={applyRecentClinicalErrorsPreset}
                            className="rounded border border-amber-300 bg-amber-50 px-3 py-1 text-sm text-amber-900 hover:bg-amber-100"
                        >
                            {modalLabels.recentClinicalErrors}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                const nextFilters = { ...EMPTY_FILTERS };
                                setFilters(nextFilters);
                                setPage(1);
                                void loadLogs(1, true, nextFilters);
                            }}
                            className="rounded bg-gray-50 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100"
                        >
                            {modalLabels.reset}
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex items-center gap-3 text-sm text-gray-500">
                            <span
                                className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700"
                                aria-hidden="true"
                            />
                            <span>{modalLabels.loadingLogs}</span>
                        </div>
                    ) : error ? (
                        <div className="rounded bg-red-50 p-3 text-sm text-red-700">
                            {error}
                        </div>
                    ) : logs.length === 0 ? (
                        <p className="text-sm text-gray-500">{modalLabels.noResult}</p>
                    ) : (
                        <>
                            <div className="max-h-[420px] overflow-auto rounded border border-gray-200">
                                <table className="min-w-full border-collapse text-left text-xs sm:text-sm">
                                    <thead className="bg-gray-50 text-gray-600">
                                        <tr>
                                            <th className="px-3 py-2">{modalLabels.date}</th>
                                            <th className="px-3 py-2">{modalLabels.tableAction}</th>
                                            <th className="px-3 py-2">{modalLabels.tableResult}</th>
                                            <th className="px-3 py-2">{modalLabels.user}</th>
                                            <th className="px-3 py-2">{modalLabels.tableRole}</th>
                                            <th className="px-3 py-2">{modalLabels.tableIp}</th>
                                            <th className="px-3 py-2">{modalLabels.tableModel}</th>
                                            <th className="px-3 py-2">{modalLabels.tableNeutralized}</th>
                                            <th className="px-3 py-2">{modalLabels.payload}</th>
                                            <th className="px-3 py-2">{modalLabels.path}</th>
                                            <th className="px-3 py-2">{modalLabels.tableTransport}</th>
                                            <th className="px-3 py-2">{modalLabels.tableClassification}</th>
                                            <th className="px-3 py-2">{modalLabels.upstream}</th>
                                            <th className="px-3 py-2">{modalLabels.error}</th>
                                            <th className="px-3 py-2">{modalLabels.context}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log) => (
                                            <tr key={log.id} className="border-t border-gray-100 align-top">
                                                <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                                                    {formatTimestamp(log.timestamp, modalLabels)}
                                                </td>
                                                <td className="px-3 py-2 text-gray-800">{log.action || "-"}</td>
                                                <td className="px-3 py-2 text-gray-800">{log.outcome || "-"}</td>
                                                <td className="px-3 py-2 text-gray-700">
                                                    <div>{log.actorUsernameMasked || "-"}</div>
                                                    <div className="text-[11px] text-gray-500">
                                                        {log.actorUserId || "-"}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2 text-gray-700">{log.actorRole || "-"}</td>
                                                <td className="px-3 py-2 text-gray-700">{log.ip || "-"}</td>
                                                <td className="px-3 py-2 text-gray-700">{log.model || "-"}</td>
                                                <td className="px-3 py-2 text-gray-700">{log.neutralized ? modalLabels.yes : modalLabels.no}</td>
                                                <td className="px-3 py-2 text-gray-700">
                                                    <div className="max-w-[180px] break-all">{log.payloadHash || "-"}</div>
                                                    <div className="text-[11px] text-gray-500">{log.payloadSizeBytes} {modalLabels.bytesSuffix}</div>
                                                </td>
                                                <td className="px-3 py-2 text-gray-700">{log.requestPath || "-"}</td>
                                                <td className="px-3 py-2 text-gray-700">{log.transport || "-"}</td>
                                                <td className="px-3 py-2 text-gray-700">
                                                    <div>{log.dataClassification || "-"}</div>
                                                    <div className="text-[11px] text-gray-500 break-all">
                                                        {log.acknowledgmentIncidentId || "-"}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2 text-gray-700 break-all">{log.upstreamRequestId || "-"}</td>
                                                <td className="px-3 py-2 text-gray-700">{log.errorCode || "-"}</td>
                                                <td className="px-3 py-2 text-gray-700">
                                                    <div className="max-w-[220px] whitespace-pre-wrap break-words">
                                                        {formatRequestContext(log.requestContext)}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-gray-600">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (page !== 1) {
                                            void loadLogs(1, true);
                                        }
                                    }}
                                    disabled={page <= 1}
                                    className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {modalLabels.first}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const previousPage = Math.max(1, page - 1);
                                        if (previousPage !== page) {
                                            void loadLogs(previousPage, true);
                                        }
                                    }}
                                    disabled={page <= 1}
                                    className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {modalLabels.previousSymbol}
                                </button>
                                <span>
                                    {modalLabels.pagePrefix} {pagination.page}{modalLabels.pageSeparator}{Math.max(1, pagination.totalPages)} {modalLabels.dashSeparator} {pagination.total} {modalLabels.resultSuffix}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const nextPage = Math.min(
                                            Math.max(1, pagination.totalPages),
                                            page + 1
                                        );
                                        if (nextPage !== page) {
                                            void loadLogs(nextPage, true);
                                        }
                                    }}
                                    disabled={page >= Math.max(1, pagination.totalPages)}
                                    className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {modalLabels.nextSymbol}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const lastPage = Math.max(1, pagination.totalPages);
                                        if (page !== lastPage) {
                                            void loadLogs(lastPage, true);
                                        }
                                    }}
                                    disabled={page >= Math.max(1, pagination.totalPages)}
                                    className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {modalLabels.last}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
