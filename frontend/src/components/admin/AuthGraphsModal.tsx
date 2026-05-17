import React from "react";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

type AuthGraphPoint = {
    date: string;
    total: number;
    [key: string]: string | number;
};

type AuthGraphPieEntry = {
    action: string;
    value: number;
};

type HeaderLabels = {
    controls: {
        close: string;
    };
    authLogsModal: {
        startDate: string;
        endDate: string;
    };
    authGraphsModal: {
        titlePrefix: string;
        axisLabel: string;
        loading: string;
        emptyRange: string;
        emptyAction: string;
        logCount: string;
    };
};

type AuthGraphsModalProps = {
    isOpen: boolean;
    title: string;
    startDate: string;
    endDate: string;
    loading: boolean;
    error: string | null;
    graphType: "xy" | "pie" | "histogram";
    graphPoints: AuthGraphPoint[];
    graphActions: string[];
    pieData: AuthGraphPieEntry[];
    graphActionColors: Record<string, string>;
    headerLabels: HeaderLabels;
    renderLabel: (text: string) => React.ReactNode;
    histogramTooltip: React.ReactElement;
    lineTooltip: React.ReactElement;
    onClose: () => void;
    onStartDateChange: (value: string) => void;
    onEndDateChange: (value: string) => void;
    onPieSliceClick: (actionName: string) => void;
};

export function AuthGraphsModal({
    isOpen,
    title,
    startDate,
    endDate,
    loading,
    error,
    graphType,
    graphPoints,
    graphActions,
    pieData,
    graphActionColors,
    headerLabels,
    renderLabel,
    histogramTooltip,
    lineTooltip,
    onClose,
    onStartDateChange,
    onEndDateChange,
    onPieSliceClick,
}: AuthGraphsModalProps) {
    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 px-4 py-4 sm:py-6">
            <div className="mx-auto flex min-h-full w-full max-w-5xl items-start sm:items-center">
                <div className="w-full max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl bg-white p-5 shadow-2xl sm:max-h-[calc(100vh-3rem)]">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                        >
                            {renderLabel(headerLabels.controls.close)}
                        </button>
                    </div>

                    <div className="mb-3 text-xs text-gray-500">
                        {renderLabel(headerLabels.authGraphsModal.axisLabel)}
                    </div>

                    <div className="mb-4 grid gap-3 sm:grid-cols-2">
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
                    </div>

                    {loading ? (
                        <div className="flex items-center gap-3 text-sm text-gray-500">
                            <span
                                className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700"
                                aria-hidden="true"
                            />
                            <span>{renderLabel(headerLabels.authGraphsModal.loading)}</span>
                        </div>
                    ) : error ? (
                        <div className="rounded bg-red-50 p-3 text-sm text-red-700">
                            {error}
                        </div>
                    ) : graphPoints.length === 0 ? (
                        <p className="text-sm text-gray-500">{renderLabel(headerLabels.authGraphsModal.emptyRange)}</p>
                    ) : (
                        <div className="h-80 w-full rounded border border-gray-200 p-2 sm:p-4">
                            {graphType === "pie" ? (
                                pieData.length === 0 ? (
                                    <p className="px-2 py-4 text-sm text-gray-500">{renderLabel(headerLabels.authGraphsModal.emptyAction)}</p>
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Tooltip />
                                            <Legend />
                                            <Pie
                                                data={pieData}
                                                dataKey="value"
                                                nameKey="action"
                                                outerRadius={120}
                                                label
                                                onClick={(entry) => {
                                                    const actionName = entry?.action;
                                                    if (typeof actionName === "string" && actionName) {
                                                        onPieSliceClick(actionName);
                                                    }
                                                }}
                                            >
                                                {pieData.map((entry) => (
                                                    <Cell
                                                        key={entry.action}
                                                        fill={graphActionColors[entry.action] || "#4b5563"}
                                                    />
                                                ))}
                                            </Pie>
                                        </PieChart>
                                    </ResponsiveContainer>
                                )
                            ) : graphType === "histogram" ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={graphPoints} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="date" />
                                        <YAxis allowDecimals={false} />
                                        <Tooltip wrapperStyle={{ pointerEvents: "auto" }} content={histogramTooltip} />
                                        <Bar dataKey="total" name={headerLabels.authGraphsModal.logCount} fill="#2563eb" />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={graphPoints} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="date" />
                                        <YAxis allowDecimals={false} />
                                        <Legend />
                                        <Tooltip trigger="click" wrapperStyle={{ pointerEvents: "auto" }} content={lineTooltip} />
                                        {graphActions.map((actionName) => (
                                            <Line
                                                key={actionName}
                                                type="monotone"
                                                dataKey={actionName}
                                                stroke={graphActionColors[actionName] || "#4b5563"}
                                                strokeWidth={2}
                                                dot={{ r: 3 }}
                                                activeDot={{ r: 5 }}
                                                name={actionName}
                                            />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
