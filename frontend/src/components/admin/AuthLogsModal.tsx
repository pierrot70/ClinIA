import React from "react";

type AuthLogEntry = {
    id: string;
    action: string;
    outcome: string;
    userId: string | null;
    usernameMasked: string;
    actorUsername: string | null;
    targetUsername: string | null;
    role: string | null;
    ip: string | null;
    reason: string | null;
    timestamp: string;
};

type AuthLogPagination = {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
};

type AuthLogOption = {
    value: string;
    label: string;
};

type HeaderLabels = {
    controls: {
        close: string;
        search: string;
        reset: string;
    };
    authLogsModal: {
        title: string;
        queryTimePrefix: string;
        startDate: string;
        endDate: string;
        action: string;
        passwordEventsOnly: string;
        loading: string;
        empty: string;
        tableDate: string;
        tableAction: string;
        tableResult: string;
        tableUser: string;
        tableTargetUser: string;
        tableRole: string;
        tableIp: string;
        tableReason: string;
        page: string;
        results: string;
    };
};

type AuthLogsModalProps = {
    isOpen: boolean;
    isSuperAdmin: boolean;
    queryDurationMs: number | null;
    startDate: string;
    endDate: string;
    action: string;
    passwordEventsOnly: boolean;
    options: AuthLogOption[];
    loading: boolean;
    error: string | null;
    logs: AuthLogEntry[];
    pagination: AuthLogPagination;
    headerLabels: HeaderLabels;
    renderLabel: (text: string) => React.ReactNode;
    formatTimestamp: (value: string) => string;
    onClose: () => void;
    onStartDateChange: (value: string) => void;
    onEndDateChange: (value: string) => void;
    onActionChange: (value: string) => void;
    onPasswordEventsOnlyChange: (value: boolean) => void;
    onSearch: () => void;
    onReset: () => void;
    onLoadPage: (page: number) => void;
};

export function AuthLogsModal({
    isOpen,
    isSuperAdmin,
    queryDurationMs,
    startDate,
    endDate,
    action,
    passwordEventsOnly,
    options,
    loading,
    error,
    logs,
    pagination,
    headerLabels,
    renderLabel,
    formatTimestamp,
    onClose,
    onStartDateChange,
    onEndDateChange,
    onActionChange,
    onPasswordEventsOnlyChange,
    onSearch,
    onReset,
    onLoadPage,
}: AuthLogsModalProps) {
    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/40 px-4 py-4 sm:py-6">
            <div className="mx-auto flex min-h-full w-full max-w-5xl items-start sm:items-center">
                <div className="w-full max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl bg-white p-5 shadow-2xl sm:max-h-[calc(100vh-3rem)]">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-lg font-semibold text-gray-900">
                            {renderLabel(headerLabels.authLogsModal.title)}
                        </h2>
                        <div className="flex items-center gap-3">
                            {isSuperAdmin && queryDurationMs !== null && (
                                <span className="text-xs text-gray-500">
                                    {renderLabel(headerLabels.authLogsModal.queryTimePrefix)} {queryDurationMs} ms
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                            >
                                {renderLabel(headerLabels.controls.close)}
                            </button>
                        </div>
                    </div>

                    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="text-sm text-gray-700">
                            {renderLabel(headerLabels.authLogsModal.startDate)}
                            <input
                                type="date"
                                value={startDate}
                                max={endDate || undefined}
                                onChange={(event) => onStartDateChange(event.target.value)}
                                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                        </label>
                        <label className="text-sm text-gray-700">
                            {renderLabel(headerLabels.authLogsModal.endDate)}
                            <input
                                type="date"
                                value={endDate}
                                min={startDate || undefined}
                                onChange={(event) => onEndDateChange(event.target.value)}
                                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                        </label>
                        <label className="text-sm text-gray-700 sm:col-span-2">
                            {renderLabel(headerLabels.authLogsModal.action)}
                            <select
                                value={action}
                                onChange={(event) => onActionChange(event.target.value)}
                                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                            >
                                {options.map((option) => (
                                    <option key={option.value || "ALL"} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <div className="mb-4">
                        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                            <input
                                type="checkbox"
                                checked={passwordEventsOnly}
                                onChange={(event) => onPasswordEventsOnlyChange(event.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                            />
                            {renderLabel(headerLabels.authLogsModal.passwordEventsOnly)}
                        </label>
                    </div>

                    <div className="mb-4 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onSearch}
                            className="rounded bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
                        >
                            {renderLabel(headerLabels.controls.search)}
                        </button>
                        <button
                            type="button"
                            onClick={onReset}
                            className="rounded bg-gray-50 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100"
                        >
                            {renderLabel(headerLabels.controls.reset)}
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex items-center gap-3 text-sm text-gray-500">
                            <span
                                className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700"
                                aria-hidden="true"
                            />
                            <span>{renderLabel(headerLabels.authLogsModal.loading)}</span>
                        </div>
                    ) : error ? (
                        <div className="rounded bg-red-50 p-3 text-sm text-red-700">
                            {error}
                        </div>
                    ) : logs.length === 0 ? (
                        <p className="text-sm text-gray-500">{renderLabel(headerLabels.authLogsModal.empty)}</p>
                    ) : (
                        <>
                            <div className="max-h-[420px] overflow-auto rounded border border-gray-200">
                                <table className="min-w-full border-collapse text-left text-xs sm:text-sm">
                                    <thead className="bg-gray-50 text-gray-600">
                                        <tr>
                                            <th className="px-3 py-2">{renderLabel(headerLabels.authLogsModal.tableDate)}</th>
                                            <th className="px-3 py-2">{renderLabel(headerLabels.authLogsModal.tableAction)}</th>
                                            <th className="px-3 py-2">{renderLabel(headerLabels.authLogsModal.tableResult)}</th>
                                            <th className="px-3 py-2">{renderLabel(headerLabels.authLogsModal.tableUser)}</th>
                                            <th className="px-3 py-2">{renderLabel(headerLabels.authLogsModal.tableTargetUser)}</th>
                                            <th className="px-3 py-2">{renderLabel(headerLabels.authLogsModal.tableRole)}</th>
                                            <th className="px-3 py-2">{renderLabel(headerLabels.authLogsModal.tableIp)}</th>
                                            <th className="px-3 py-2">{renderLabel(headerLabels.authLogsModal.tableReason)}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log) => (
                                            <tr key={log.id} className="border-t border-gray-100 align-top">
                                                <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{formatTimestamp(log.timestamp)}</td>
                                                <td className="px-3 py-2 text-gray-800">{log.action || "-"}</td>
                                                <td className="px-3 py-2 text-gray-800">{log.outcome || "-"}</td>
                                                <td className="px-3 py-2 text-gray-700">
                                                    <div>{log.actorUsername || "-"}</div>
                                                    <div className="text-[11px] text-gray-500">{log.usernameMasked || "-"}</div>
                                                </td>
                                                <td className="px-3 py-2 text-gray-700">{log.targetUsername || "-"}</td>
                                                <td className="px-3 py-2 text-gray-700">{log.role || "-"}</td>
                                                <td className="px-3 py-2 text-gray-700">{log.ip || "-"}</td>
                                                <td className="px-3 py-2 text-gray-700">{log.reason || "-"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-gray-600">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (pagination.page !== 1) {
                                            onLoadPage(1);
                                        }
                                    }}
                                    disabled={pagination.page <= 1}
                                    className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {"<<"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const previousPage = Math.max(1, pagination.page - 1);
                                        if (previousPage !== pagination.page) {
                                            onLoadPage(previousPage);
                                        }
                                    }}
                                    disabled={pagination.page <= 1}
                                    className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {"<"}
                                </button>
                                <span>
                                    {renderLabel(headerLabels.authLogsModal.page)} {pagination.page}/{Math.max(1, pagination.totalPages)} - {pagination.total} {renderLabel(headerLabels.authLogsModal.results)}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const nextPage = Math.min(
                                            Math.max(1, pagination.totalPages),
                                            pagination.page + 1
                                        );
                                        if (nextPage !== pagination.page) {
                                            onLoadPage(nextPage);
                                        }
                                    }}
                                    disabled={pagination.page >= Math.max(1, pagination.totalPages)}
                                    className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {">"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const lastPage = Math.max(1, pagination.totalPages);
                                        if (pagination.page !== lastPage) {
                                            onLoadPage(lastPage);
                                        }
                                    }}
                                    disabled={pagination.page >= Math.max(1, pagination.totalPages)}
                                    className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {">>"}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
