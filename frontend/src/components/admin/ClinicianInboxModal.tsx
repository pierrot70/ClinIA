import React from "react";

import type { ClinicianComment } from "../../services/clinicianCommentsApi";

type InboxRepliedFilter = "" | "yes" | "no";

type ClinicianInboxPagination = {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
};

type ClinicianInboxLabels = {
    title: string;
    description: string;
    refresh: string;
    close: string;
    filtersActor: string;
    filtersCategory: string;
    filtersReplied: string;
    filtersStartDate: string;
    filtersEndDate: string;
    all: string;
    allFeminine: string;
    repliedYes: string;
    repliedNo: string;
    loading: string;
    empty: string;
    createdAt: string;
    actor: string;
    category: string;
    replied: string;
    comment: string;
    action: string;
    reply: string;
    replyPlaceholder: string;
    replying: string;
    replySubmit: string;
    replyCancel: string;
    replySaved: string;
    pagePrefix: string;
    pageSeparator: string;
    resultSuffix: string;
    first: string;
    previousSymbol: string;
    nextSymbol: string;
    last: string;
};

type HeaderLabels = {
    controls: {
        search: string;
    };
};

type ClinicianInboxModalProps = {
    isOpen: boolean;
    labels: ClinicianInboxLabels;
    headerLabels: HeaderLabels;
    items: ClinicianComment[];
    actors: string[];
    loading: boolean;
    error: string | null;
    actorFilter: string;
    categoryFilter: string;
    repliedFilter: InboxRepliedFilter;
    startDate: string;
    endDate: string;
    pagination: ClinicianInboxPagination;
    replyTargetId: string;
    replyMessage: string;
    replying: boolean;
    replySuccess: string;
    onClose: () => void;
    onRefresh: () => void;
    onActorFilterChange: (value: string) => void;
    onCategoryFilterChange: (value: string) => void;
    onRepliedFilterChange: (value: InboxRepliedFilter) => void;
    onStartDateChange: (value: string) => void;
    onEndDateChange: (value: string) => void;
    onSearch: () => void;
    onToggleReply: (itemId: string) => void;
    onReplyMessageChange: (value: string) => void;
    onSubmitReply: () => void;
    onCancelReply: () => void;
    onLoadPage: (page: number) => void;
};

export function ClinicianInboxModal({
    isOpen,
    labels,
    headerLabels,
    items,
    actors,
    loading,
    error,
    actorFilter,
    categoryFilter,
    repliedFilter,
    startDate,
    endDate,
    pagination,
    replyTargetId,
    replyMessage,
    replying,
    replySuccess,
    onClose,
    onRefresh,
    onActorFilterChange,
    onCategoryFilterChange,
    onRepliedFilterChange,
    onStartDateChange,
    onEndDateChange,
    onSearch,
    onToggleReply,
    onReplyMessageChange,
    onSubmitReply,
    onCancelReply,
    onLoadPage,
}: ClinicianInboxModalProps) {
    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/40 px-4 py-4 sm:py-6">
            <div className="mx-auto flex min-h-full w-full max-w-5xl items-start sm:items-center">
                <div className="w-full max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl bg-white p-5 shadow-2xl sm:max-h-[calc(100vh-3rem)]">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">
                                {labels.title}
                            </h2>
                            <p className="mt-1 text-sm text-gray-600">
                                {labels.description}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
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

                    <div className="mb-4 grid gap-3 sm:grid-cols-5">
                        <label className="text-sm text-gray-700">
                            {labels.filtersActor}
                            <select
                                value={actorFilter}
                                onChange={(event) => onActorFilterChange(event.target.value)}
                                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                            >
                                <option value="">{labels.all}</option>
                                {actors.map((actor) => (
                                    <option key={actor} value={actor}>
                                        {actor}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="text-sm text-gray-700">
                            {labels.filtersCategory}
                            <select
                                value={categoryFilter}
                                onChange={(event) => onCategoryFilterChange(event.target.value)}
                                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                            >
                                <option value="">{labels.allFeminine}</option>
                                <option value="BUG">BUG</option>
                                <option value="SUGGESTION">SUGGESTION</option>
                                <option value="URGENT">URGENT</option>
                                <option value="INCOMPREHENSION">INCOMPREHENSION</option>
                            </select>
                        </label>
                        <label className="text-sm text-gray-700">
                            {labels.filtersReplied}
                            <select
                                value={repliedFilter}
                                onChange={(event) => onRepliedFilterChange(event.target.value as InboxRepliedFilter)}
                                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                            >
                                <option value="">{labels.all}</option>
                                <option value="yes">{labels.repliedYes}</option>
                                <option value="no">{labels.repliedNo}</option>
                            </select>
                        </label>
                        <label className="text-sm text-gray-700">
                            {labels.filtersStartDate}
                            <input
                                type="date"
                                value={startDate}
                                max={endDate || undefined}
                                onChange={(event) => onStartDateChange(event.target.value)}
                                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                        </label>
                        <label className="text-sm text-gray-700">
                            {labels.filtersEndDate}
                            <input
                                type="date"
                                value={endDate}
                                min={startDate || undefined}
                                onChange={(event) => onEndDateChange(event.target.value)}
                                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                        </label>
                    </div>

                    <div className="mb-4">
                        <button
                            type="button"
                            onClick={onSearch}
                            className="rounded bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
                        >
                            {headerLabels.controls.search}
                        </button>
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
                            {replySuccess ? (
                                <div className="mb-3 rounded bg-emerald-50 p-3 text-sm text-emerald-700">
                                    {replySuccess}
                                </div>
                            ) : null}
                            <div className="overflow-x-auto rounded-lg border border-gray-200">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50 text-left text-gray-700">
                                        <tr>
                                            <th className="px-3 py-2">{labels.createdAt}</th>
                                            <th className="px-3 py-2">{labels.actor}</th>
                                            <th className="px-3 py-2">{labels.category}</th>
                                            <th className="px-3 py-2">{labels.replied}</th>
                                            <th className="px-3 py-2">{labels.comment}</th>
                                            <th className="px-3 py-2">{labels.action}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((item) => (
                                            <React.Fragment key={item.id}>
                                                <tr className="border-t border-gray-100 align-top">
                                                    <td className="px-3 py-2 text-gray-600">
                                                        {new Date(item.createdAt).toLocaleString()}
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-900">
                                                        {item.actorUsername}
                                                        <div className="text-xs text-gray-500">{item.actorRole}</div>
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-700">{item.category}</td>
                                                    <td className="px-3 py-2 text-gray-700">
                                                        {item.replies.length > 0 ? labels.repliedYes : labels.repliedNo}
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-800 whitespace-pre-wrap">
                                                        {item.comment}
                                                        {item.replies.length > 0 ? (
                                                            <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                                                                {item.replies.map((reply) => (
                                                                    <div key={reply.id} className="rounded bg-gray-50 p-2 text-xs text-gray-700">
                                                                        <div className="font-medium text-gray-800">
                                                                            {reply.responderUsername} ({reply.responderRole})
                                                                        </div>
                                                                        <div className="text-[11px] text-gray-500">
                                                                            {new Date(reply.createdAt).toLocaleString()}
                                                                        </div>
                                                                        <div className="mt-1 whitespace-pre-wrap">
                                                                            {reply.message}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : null}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => onToggleReply(item.id)}
                                                            className="rounded bg-sky-100 px-3 py-1 text-sm text-sky-800 hover:bg-sky-200"
                                                        >
                                                            {labels.reply}
                                                        </button>
                                                    </td>
                                                </tr>
                                                {replyTargetId === item.id ? (
                                                    <tr className="border-t border-gray-100 bg-sky-50/40">
                                                        <td colSpan={6} className="px-3 py-3">
                                                            <div className="space-y-3">
                                                                <textarea
                                                                    value={replyMessage}
                                                                    onChange={(event) => onReplyMessageChange(event.target.value)}
                                                                    placeholder={labels.replyPlaceholder}
                                                                    className="min-h-[120px] w-full rounded border border-gray-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                                                                    maxLength={500}
                                                                />
                                                                <div className="flex gap-3">
                                                                    <button
                                                                        type="button"
                                                                        onClick={onSubmitReply}
                                                                        disabled={replying || !replyMessage.trim()}
                                                                        className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                                                                    >
                                                                        {replying ? labels.replying : labels.replySubmit}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={onCancelReply}
                                                                        disabled={replying}
                                                                        className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                                                                    >
                                                                        {labels.replyCancel}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : null}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-4 flex items-center justify-between gap-3 text-sm text-gray-600">
                                <div>
                                    {labels.pagePrefix} {pagination.page}{labels.pageSeparator}{Math.max(1, pagination.totalPages)} - {pagination.total} {labels.resultSuffix}
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
