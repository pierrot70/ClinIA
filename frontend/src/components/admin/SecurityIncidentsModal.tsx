import React from "react";
import { CircleHelp } from "lucide-react";

import type { SecurityIncidentEntry, SecurityIncidentPagination } from "../../services/securityIncidentApi";

type SecurityIncidentAcknowledgedFilter = "" | "true" | "false";

type HeaderLabels = {
    securityIncidentsModal: {
        title: string;
        description: string;
        refresh: string;
        close: string;
        filtersAcknowledged: string;
        all: string;
        notAcknowledgedOnly: string;
        acknowledgedOnly: string;
        type: string;
        loading: string;
        empty: string;
        detectedAt: string;
        reason: string;
        requestPath: string;
        context: string;
        action: string;
        acknowledgedAtPrefix: string;
        impactedAccount: string;
        acknowledged: string;
        acknowledging: string;
        acknowledge: string;
        explain: string;
        hideExplanation: string;
        summarize: string;
        hideSummary: string;
        summaryTitle: string;
        summaryEvent: string;
        summaryProtection: string;
        summaryImpact: string;
        summaryRecommendedAction: string;
        summaryPrivacy: string;
        nonSecurePreCloudSummaryEvent: string;
        nonSecurePreCloudSummaryProtection: string;
        nonSecurePreCloudSummaryImpact: string;
        cspViolationSummaryEvent: string;
        cspViolationSummaryProtection: string;
        cspViolationSummaryImpact: string;
        massDownloadSummaryEvent: string;
        massDownloadSummaryProtection: string;
        massDownloadSummaryImpact: string;
        genericSummaryEvent: string;
        genericSummaryProtection: string;
        genericSummaryImpact: string;
        globalSummaryNoIncidents: string;
        globalSummaryCount: string;
        globalSummaryUnacknowledged: string;
        globalSummaryAllAcknowledged: string;
        globalSummaryPreCloud: string;
        globalSummaryCsp: string;
        globalSummaryMassDownload: string;
        globalSummaryOther: string;
        globalSummaryPriorityPreCloud: string;
        globalSummaryPriorityMassDownload: string;
        globalSummaryPriorityCsp: string;
        globalSummaryPriorityGeneric: string;
        explanationTitle: string;
        explanationWhatHappened: string;
        explanationWhatWasBlocked: string;
        explanationNextStep: string;
        explanationAcknowledgement: string;
        nonSecurePreCloudWhatHappened: string;
        nonSecurePreCloudWhatWasBlocked: string;
        nonSecurePreCloudNextStep: string;
        cspViolationWhatHappened: string;
        cspViolationWhatWasBlocked: string;
        cspViolationNextStep: string;
        pagePrefix: string;
        pageSeparator: string;
        resultSuffix: string;
        first: string;
        previousSymbol: string;
        nextSymbol: string;
        last: string;
    };
};

type SecurityIncidentsModalProps = {
    isOpen: boolean;
    items: SecurityIncidentEntry[];
    loading: boolean;
    error: string | null;
    ackingId: string;
    acknowledgedFilter: SecurityIncidentAcknowledgedFilter;
    typeFilter: string;
    pagination: SecurityIncidentPagination;
    headerLabels: HeaderLabels;
    onClose: () => void;
    onRefresh: () => void;
    onAcknowledgedFilterChange: (value: SecurityIncidentAcknowledgedFilter) => void;
    onTypeFilterChange: (value: string) => void;
    onAcknowledge: (incidentId: string) => void;
    onLoadPage: (page: number) => void;
};

export function SecurityIncidentsModal({
    isOpen,
    items,
    loading,
    error,
    ackingId,
    acknowledgedFilter,
    typeFilter,
    pagination,
    headerLabels,
    onClose,
    onRefresh,
    onAcknowledgedFilterChange,
    onTypeFilterChange,
    onAcknowledge,
    onLoadPage,
}: SecurityIncidentsModalProps) {
    const [explainedIncidentId, setExplainedIncidentId] = React.useState("");
    const [isSummaryVisible, setIsSummaryVisible] = React.useState(false);

    if (!isOpen) {
        return null;
    }

    const labels = headerLabels.securityIncidentsModal;

    function getExplanation(item: SecurityIncidentEntry) {
        if (item.type === "NON_SECURE_CONTENT" && item.phase === "pre_cloud") {
            return {
                whatHappened: labels.nonSecurePreCloudWhatHappened,
                whatWasBlocked: labels.nonSecurePreCloudWhatWasBlocked,
                nextStep: labels.nonSecurePreCloudNextStep,
            };
        }

        if (item.type === "CSP_VIOLATION") {
            return {
                whatHappened: labels.cspViolationWhatHappened,
                whatWasBlocked: labels.cspViolationWhatWasBlocked,
                nextStep: labels.cspViolationNextStep,
            };
        }

        return {
            whatHappened: labels.explanationWhatHappened,
            whatWasBlocked: labels.explanationWhatWasBlocked,
            nextStep: labels.explanationNextStep,
        };
    }

    function getGlobalSummary() {
        const counts = items.reduce<Record<string, number>>((summary, item) => {
            const key = item.type === "NON_SECURE_CONTENT" && item.phase === "pre_cloud"
                ? "preCloud"
                : item.type === "CSP_VIOLATION"
                    ? "csp"
                    : item.type === "MASS_DOWNLOAD_ATTEMPT"
                        ? "massDownload"
                        : "other";
            summary[key] = (summary[key] || 0) + 1;
            return summary;
        }, {});
        const unacknowledged = items.filter((item) => !item.acknowledged);
        const categories = [
            counts.preCloud ? `${counts.preCloud} ${labels.globalSummaryPreCloud}` : "",
            counts.massDownload ? `${counts.massDownload} ${labels.globalSummaryMassDownload}` : "",
            counts.csp ? `${counts.csp} ${labels.globalSummaryCsp}` : "",
            counts.other ? `${counts.other} ${labels.globalSummaryOther}` : "",
        ].filter(Boolean);

        let priority = labels.globalSummaryPriorityGeneric;
        if (unacknowledged.some((item) => item.type === "NON_SECURE_CONTENT" && item.phase === "pre_cloud")) {
            priority = labels.globalSummaryPriorityPreCloud;
        } else if (unacknowledged.some((item) => item.type === "MASS_DOWNLOAD_ATTEMPT")) {
            priority = labels.globalSummaryPriorityMassDownload;
        } else if (unacknowledged.some((item) => item.type === "CSP_VIOLATION")) {
            priority = labels.globalSummaryPriorityCsp;
        }

        return {
            event: items.length
                ? `${items.length} ${labels.globalSummaryCount}; ${unacknowledged.length} ${labels.globalSummaryUnacknowledged}.`
                : labels.globalSummaryNoIncidents,
            protection: categories.length ? categories.join("; ") : labels.globalSummaryNoIncidents,
            impact: unacknowledged.length
                ? `${unacknowledged.length} ${labels.globalSummaryUnacknowledged}.`
                : labels.globalSummaryAllAcknowledged,
            nextStep: priority,
        };
    }

    const globalSummary = getGlobalSummary();

    return (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/40 px-4 py-4 sm:py-6">
            <div className="mx-auto flex min-h-full w-full max-w-6xl items-start sm:items-center">
                <div className="w-full max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl bg-white p-5 shadow-2xl sm:max-h-[calc(100vh-3rem)]">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">{labels.title}</h2>
                            <p className="mt-1 text-sm text-gray-600">{labels.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setIsSummaryVisible((visible) => !visible)}
                                className="rounded border border-indigo-300 px-3 py-1 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
                            >
                                {isSummaryVisible ? labels.hideSummary : labels.summarize}
                            </button>
                            <button
                                type="button"
                                onClick={onRefresh}
                                className="rounded bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
                            >
                                {labels.refresh}
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                            >
                                {labels.close}
                            </button>
                        </div>
                    </div>

                    {isSummaryVisible ? (
                        <section className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 text-sm text-slate-700">
                            <h3 className="font-semibold text-slate-900">{labels.summaryTitle}</h3>
                            <p className="mt-2"><span className="font-medium text-slate-900">{labels.summaryEvent}</span> {globalSummary.event}</p>
                            <p className="mt-1"><span className="font-medium text-slate-900">{labels.summaryProtection}</span> {globalSummary.protection}</p>
                            <p className="mt-1"><span className="font-medium text-slate-900">{labels.summaryImpact}</span> {globalSummary.impact}</p>
                            <p className="mt-1"><span className="font-medium text-slate-900">{labels.summaryRecommendedAction}</span> {globalSummary.nextStep}</p>
                            <p className="mt-2 text-xs text-slate-600">{labels.summaryPrivacy}</p>
                        </section>
                    ) : null}

                    <div className="mb-4 grid gap-3 sm:grid-cols-2">
                        <label className="text-sm text-gray-700">
                            {labels.filtersAcknowledged}
                            <select
                                value={acknowledgedFilter}
                                onChange={(event) => onAcknowledgedFilterChange(event.target.value as SecurityIncidentAcknowledgedFilter)}
                                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                            >
                                <option value="">{labels.all}</option>
                                <option value="false">{labels.notAcknowledgedOnly}</option>
                                <option value="true">{labels.acknowledgedOnly}</option>
                            </select>
                        </label>
                        <label className="text-sm text-gray-700">
                            {labels.type}
                            <select
                                value={typeFilter}
                                onChange={(event) => onTypeFilterChange(event.target.value)}
                                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                            >
                                <option value="">{labels.all}</option>
                                <option value="MASS_DOWNLOAD_ATTEMPT">MASS_DOWNLOAD_ATTEMPT</option>
                                <option value="NON_SECURE_CONTENT">NON_SECURE_CONTENT</option>
                                <option value="CSP_VIOLATION">CSP_VIOLATION</option>
                            </select>
                        </label>
                    </div>

                    {loading ? (
                        <p className="text-sm text-gray-500">{labels.loading}</p>
                    ) : error ? (
                        <div className="rounded bg-red-50 p-3 text-sm text-red-700">
                            {error}
                        </div>
                    ) : items.length === 0 ? (
                        <p className="text-sm text-gray-500">{labels.empty}</p>
                    ) : (
                        <>
                            <div className="overflow-x-auto rounded-lg border border-gray-200">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50 text-left text-gray-700">
                                        <tr>
                                            <th className="px-3 py-2">{labels.detectedAt}</th>
                                            <th className="px-3 py-2">{labels.type}</th>
                                            <th className="px-3 py-2">{labels.reason}</th>
                                            <th className="px-3 py-2">{labels.requestPath}</th>
                                            <th className="px-3 py-2">{labels.context}</th>
                                            <th className="px-3 py-2">{labels.action}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((item) => {
                                            const explanation = getExplanation(item);
                                            const isExplanationVisible = explainedIncidentId === item.id;
                                            const impactedAccount =
                                                typeof item.context?.username === "string" && item.context.username.trim()
                                                    ? item.context.username.trim()
                                                    : typeof item.context?.userId === "string" && item.context.userId.trim()
                                                        ? item.context.userId.trim()
                                                        : "";
                                            const contextSummary = [
                                                item.context?.role ? `role=${String(item.context.role)}` : "",
                                                item.context?.userId ? `user=${String(item.context.userId)}` : "",
                                                item.context?.ip ? `ip=${String(item.context.ip)}` : "",
                                                item.context?.totalCost ? `volume=${String(item.context.totalCost)}` : "",
                                                item.context?.directive ? `directive=${String(item.context.directive)}` : "",
                                                item.context?.resource ? `resource=${String(item.context.resource)}` : "",
                                            ]
                                                .filter(Boolean)
                                                .join(" | ");

                                            return (
                                                <React.Fragment key={item.id}>
                                                <tr className="border-t border-gray-100 align-top">
                                                    <td className="px-3 py-2 text-gray-600">
                                                        {new Date(item.detectedAt || item.createdAt || "").toLocaleString()}
                                                        {item.acknowledgedAt ? (
                                                            <div className="mt-1 text-xs text-emerald-700">
                                                                {labels.acknowledgedAtPrefix}{" "}
                                                                {new Date(item.acknowledgedAt).toLocaleString()}
                                                            </div>
                                                        ) : null}
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-900">
                                                        <div className="font-medium">{item.type}</div>
                                                        <div className="text-xs text-gray-500">{item.phase}</div>
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-800 whitespace-pre-wrap">
                                                        {item.reason}
                                                    </td>
                                                    <td className="px-3 py-2 text-xs text-gray-700 break-all">
                                                        {item.requestPath}
                                                    </td>
                                                    <td className="px-3 py-2 text-xs text-gray-700 whitespace-pre-wrap">
                                                        {impactedAccount ? (
                                                            <div className="mb-1 text-xs font-medium text-gray-900">
                                                                {labels.impactedAccount}: {impactedAccount}
                                                            </div>
                                                        ) : null}
                                                        {contextSummary || "—"}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="flex flex-wrap gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => setExplainedIncidentId(
                                                                    isExplanationVisible ? "" : item.id
                                                                )}
                                                                className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                                            >
                                                                <CircleHelp size={14} aria-hidden="true" />
                                                                {isExplanationVisible
                                                                    ? labels.hideExplanation
                                                                    : labels.explain}
                                                            </button>
                                                            {item.acknowledged ? (
                                                                <span className="inline-flex rounded bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                                                                    {labels.acknowledged}
                                                                </span>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onAcknowledge(item.id)}
                                                                    disabled={ackingId === item.id}
                                                                    className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                                                                >
                                                                    {ackingId === item.id ? labels.acknowledging : labels.acknowledge}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                                {isExplanationVisible ? (
                                                    <tr className="border-t border-slate-100 bg-slate-50">
                                                        <td className="px-3 py-3" colSpan={6}>
                                                            <div className="max-w-4xl text-sm text-slate-700">
                                                                <h3 className="font-semibold text-slate-900">
                                                                    {labels.explanationTitle}
                                                                </h3>
                                                                <p className="mt-2">
                                                                    <span className="font-medium text-slate-900">
                                                                        {labels.explanationWhatHappened}
                                                                    </span>{" "}
                                                                    {explanation.whatHappened}
                                                                </p>
                                                                <p className="mt-1">
                                                                    <span className="font-medium text-slate-900">
                                                                        {labels.explanationWhatWasBlocked}
                                                                    </span>{" "}
                                                                    {explanation.whatWasBlocked}
                                                                </p>
                                                                <p className="mt-1">
                                                                    <span className="font-medium text-slate-900">
                                                                        {labels.explanationNextStep}
                                                                    </span>{" "}
                                                                    {explanation.nextStep}
                                                                </p>
                                                                <p className="mt-2 text-xs text-slate-600">
                                                                    {labels.explanationAcknowledgement}
                                                                </p>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : null}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-4 flex items-center justify-between gap-3 text-sm text-gray-600">
                                <div>
                                    {labels.pagePrefix} {pagination.page}
                                    {labels.pageSeparator}
                                    {Math.max(1, pagination.totalPages)} - {pagination.total} {labels.resultSuffix}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={pagination.page <= 1}
                                        onClick={() => onLoadPage(1)}
                                        className="rounded border border-gray-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {labels.first}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={pagination.page <= 1}
                                        onClick={() => onLoadPage(pagination.page - 1)}
                                        className="rounded border border-gray-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {labels.previousSymbol}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={pagination.page >= pagination.totalPages}
                                        onClick={() => onLoadPage(pagination.page + 1)}
                                        className="rounded border border-gray-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {labels.nextSymbol}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={pagination.page >= pagination.totalPages}
                                        onClick={() => onLoadPage(pagination.totalPages)}
                                        className="rounded border border-gray-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {labels.last}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
