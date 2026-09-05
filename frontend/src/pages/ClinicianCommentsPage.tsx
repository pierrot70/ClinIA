import React, { useContext, useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { labels } from "../i18n/uiLabels";
import { useTranslation } from "../hooks/useTranslation";
import {
    createClinicianComment,
    listClinicianComments,
    replyToClinicianComment,
    type ClinicianComment,
} from "../services/clinicianCommentsApi";
import type { WriteVerificationMeta } from "../types/api";
import {
    formatWriteVerificationMessage,
    WriteVerificationReceipt,
} from "../components/system/WriteVerificationReceipt";

const CLINICIAN_COMMENT_STORAGE_KEY = "clinia_comment_tracking";

type CommentCategoryOption = {
    value: ClinicianComment["category"];
    label: string;
};

function useCommentsPageLabels(targetLang: string) {
    const source = labels.commentsPage;
    const translationOptions = {
        targetLang,
        namespace: "comments-page",
    };

    const { translated: categoryBug } = useTranslation({ text: source.categories.bug, ...translationOptions });
    const { translated: categorySuggestion } = useTranslation({ text: source.categories.suggestion, ...translationOptions });
    const { translated: categoryUrgent } = useTranslation({ text: source.categories.urgent, ...translationOptions });
    const { translated: categoryIncomprehension } = useTranslation({ text: source.categories.incomprehension, ...translationOptions });
    const { translated: pageTitle } = useTranslation({ text: source.header.title, ...translationOptions });
    const { translated: pageDescription } = useTranslation({ text: source.header.description, ...translationOptions });
    const { translated: guestHint } = useTranslation({ text: source.header.guestHint, ...translationOptions });
    const { translated: newCommentLabel } = useTranslation({ text: source.form.newCommentLabel, ...translationOptions });
    const { translated: englishOnlyHint } = useTranslation({ text: source.form.englishOnlyHint, ...translationOptions });
    const { translated: nameLabel } = useTranslation({ text: source.form.nameLabel, ...translationOptions });
    const { translated: namePlaceholder } = useTranslation({ text: source.form.namePlaceholder, ...translationOptions });
    const { translated: trackingCodeLabel } = useTranslation({ text: source.form.trackingCodeLabel, ...translationOptions });
    const { translated: trackingCodePlaceholder } = useTranslation({ text: source.form.trackingCodePlaceholder, ...translationOptions });
    const { translated: trackingCodeHint } = useTranslation({ text: source.form.trackingCodeHint, ...translationOptions });
    const { translated: categoryLabel } = useTranslation({ text: source.form.categoryLabel, ...translationOptions });
    const { translated: commentPlaceholder } = useTranslation({ text: source.form.commentPlaceholder, ...translationOptions });
    const { translated: authenticatedPrivacyHint } = useTranslation({ text: source.form.authenticatedPrivacyHint, ...translationOptions });
    const { translated: guestPrivacyHint } = useTranslation({ text: source.form.guestPrivacyHint, ...translationOptions });
    const { translated: submittingLabel } = useTranslation({ text: source.form.submitting, ...translationOptions });
    const { translated: submitLabel } = useTranslation({ text: source.form.submit, ...translationOptions });
    const { translated: savedLabel } = useTranslation({ text: source.status.saved, ...translationOptions });
    const { translated: savedWithRedactionLabel } = useTranslation({ text: source.status.savedWithRedaction, ...translationOptions });
    const { translated: trackingCodePrefix } = useTranslation({ text: source.status.trackingCodePrefix, ...translationOptions });
    const { translated: selectCommentBeforeReply } = useTranslation({ text: source.status.selectCommentBeforeReply, ...translationOptions });
    const { translated: replySaved } = useTranslation({ text: source.status.replySaved, ...translationOptions });
    const { translated: savedCommentsTitle } = useTranslation({ text: source.list.title, ...translationOptions });
    const { translated: savedCommentsDescription } = useTranslation({ text: source.list.description, ...translationOptions });
    const { translated: ownScope } = useTranslation({ text: source.list.ownScope, ...translationOptions });
    const { translated: allScope } = useTranslation({ text: source.list.allScope, ...translationOptions });
    const { translated: allActors } = useTranslation({ text: source.list.allActors, ...translationOptions });
    const { translated: allCategories } = useTranslation({ text: source.list.allCategories, ...translationOptions });
    const { translated: loginRequired } = useTranslation({ text: source.list.loginRequired, ...translationOptions });
    const { translated: loadingComments } = useTranslation({ text: source.list.loading, ...translationOptions });
    const { translated: emptyComments } = useTranslation({ text: source.list.empty, ...translationOptions });
    const { translated: selectedCommentLabel } = useTranslation({ text: source.list.selectedCommentLabel, ...translationOptions });
    const { translated: selectedCommentPreviewTitle } = useTranslation({ text: source.list.selectedCommentPreviewTitle, ...translationOptions });
    const { translated: replyPlaceholder } = useTranslation({ text: source.list.replyPlaceholder, ...translationOptions });
    const { translated: replySubmitLabel } = useTranslation({ text: source.list.replySubmit, ...translationOptions });
    const { translated: redactionSuffix } = useTranslation({ text: source.list.redactionSuffix, ...translationOptions });
    const { translated: receiptTitle } = useTranslation({ text: labels.writeVerification.title, ...translationOptions });
    const { translated: receiptUnavailable } = useTranslation({ text: labels.writeVerification.unavailable, ...translationOptions });
    const { translated: receiptCopy } = useTranslation({ text: labels.writeVerification.copy, ...translationOptions });

    return {
        categoryOptions: [
            { value: "BUG", label: categoryBug },
            { value: "SUGGESTION", label: categorySuggestion },
            { value: "URGENT", label: categoryUrgent },
            { value: "INCOMPREHENSION", label: categoryIncomprehension },
        ] as CommentCategoryOption[],
        pageTitle,
        pageDescription,
        guestHint,
        newCommentLabel,
        englishOnlyHint,
        nameLabel,
        namePlaceholder,
        trackingCodeLabel,
        trackingCodePlaceholder,
        trackingCodeHint,
        categoryLabel,
        commentPlaceholder,
        authenticatedPrivacyHint,
        guestPrivacyHint,
        submittingLabel,
        submitLabel,
        savedLabel,
        savedWithRedactionLabel,
        trackingCodePrefix,
        selectCommentBeforeReply,
        replySaved,
        savedCommentsTitle,
        savedCommentsDescription,
        ownScope,
        allScope,
        allActors,
        allCategories,
        loginRequired,
        loadingComments,
        emptyComments,
        selectedCommentLabel,
        selectedCommentPreviewTitle,
        replyPlaceholder,
        replySubmitLabel,
        redactionSuffix,
        receiptLabels: { title: receiptTitle, unavailable: receiptUnavailable, copy: receiptCopy },
    };
}

export function ClinicianCommentsPage() {
    const i18n = useContext(HomeI18nContext) || { locale: "fr" };
    const targetLang = i18n.locale;
    const ui = useCommentsPageLabels(targetLang);
    const { user, isAuthenticated, status } = useAuth();
    const canReviewAll = user?.role === "ADMIN" || user?.role === "SUPERADMIN";
    const [scope, setScope] = useState<"own" | "all">("own");
    const [category, setCategory] =
        useState<ClinicianComment["category"]>("BUG");
    const [categoryFilter, setCategoryFilter] = useState("");
    const [comment, setComment] = useState("");
    const [guestDisplayName, setGuestDisplayName] = useState("");
    const [trackingCode, setTrackingCode] = useState("");
    const [items, setItems] = useState<ClinicianComment[]>([]);
    const [availableActorUsernames, setAvailableActorUsernames] = useState<string[]>([]);
    const [actorUsernameFilter, setActorUsernameFilter] = useState("");
    const [selectedCommentId, setSelectedCommentId] = useState("");
    const [replyMessage, setReplyMessage] = useState("");
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [replying, setReplying] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [lastWriteVerification, setLastWriteVerification] =
        useState<WriteVerificationMeta | null>(null);

    useEffect(() => {
        if (isAuthenticated) {
            return;
        }

        try {
            const raw = window.localStorage.getItem(CLINICIAN_COMMENT_STORAGE_KEY);
            if (!raw) {
                return;
            }

            const parsed = JSON.parse(raw) as {
                guestDisplayName?: string;
                trackingCode?: string;
            };
            if (parsed.guestDisplayName) {
                setGuestDisplayName(parsed.guestDisplayName);
            }
            if (parsed.trackingCode) {
                setTrackingCode(parsed.trackingCode);
            }
        } catch {
            // Ignore local storage errors.
        }
    }, [isAuthenticated]);

    useEffect(() => {
        if (!canReviewAll && scope === "all") {
            setScope("own");
        }
    }, [canReviewAll, scope]);

    useEffect(() => {
        if (!isAuthenticated) {
            setLoading(false);
            setItems([]);
            return;
        }

        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError("");

            const response = await listClinicianComments(
                scope,
                actorUsernameFilter,
                categoryFilter
            );
            if (cancelled) {
                return;
            }

            if (!response.ok) {
                setError(response.error.message);
                setItems([]);
                setLoading(false);
                return;
            }

            setItems(response.data.items || []);
            setAvailableActorUsernames(response.data.availableActorUsernames || []);
            setLoading(false);
        };

        void load();

        return () => {
            cancelled = true;
        };
    }, [actorUsernameFilter, categoryFilter, isAuthenticated, scope]);

    useEffect(() => {
        if (!items.some((item) => item.id === selectedCommentId)) {
            setSelectedCommentId(items[0]?.id || "");
        }
    }, [items, selectedCommentId]);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setSubmitting(true);
        setError("");
        setSuccess("");
        setLastWriteVerification(null);

        const response = await createClinicianComment(
            comment,
            category,
            isAuthenticated ? undefined : guestDisplayName,
            isAuthenticated ? undefined : trackingCode
        );
        setSubmitting(false);

        if (!response.ok) {
            setError(response.error.message);
            return;
        }

        setComment("");
        if (!isAuthenticated) {
            setTrackingCode(response.data.trackingCode || trackingCode);
            try {
                window.localStorage.setItem(
                    CLINICIAN_COMMENT_STORAGE_KEY,
                    JSON.stringify({
                        guestDisplayName,
                        trackingCode: response.data.trackingCode || trackingCode,
                    })
                );
            } catch {
                // Ignore local storage errors.
            }
        }
        setSuccess(
            formatWriteVerificationMessage(`${response.data.redactionCount > 0
                ? ui.savedWithRedactionLabel
                : ui.savedLabel} ${ui.trackingCodePrefix} ${response.data.trackingCode || trackingCode}`,
                response.meta?.writeVerification ?? null
            )
        );
        setLastWriteVerification(response.meta?.writeVerification ?? null);

        if (isAuthenticated) {
            const refreshed = await listClinicianComments(
                scope,
                actorUsernameFilter,
                categoryFilter
            );
            if (refreshed.ok) {
                setItems(refreshed.data.items || []);
                setAvailableActorUsernames(refreshed.data.availableActorUsernames || []);
            }
        }
    }

    async function handleReplySubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!selectedCommentId) {
            setError(ui.selectCommentBeforeReply);
            return;
        }

        setReplying(true);
        setError("");
        setSuccess("");
        setLastWriteVerification(null);

        const response = await replyToClinicianComment(selectedCommentId, replyMessage);
        setReplying(false);

        if (!response.ok) {
            setError(response.error.message);
            return;
        }

        setReplyMessage("");
        setSuccess(
            formatWriteVerificationMessage(
                ui.replySaved,
                response.meta?.writeVerification ?? null
            )
        );
        setLastWriteVerification(response.meta?.writeVerification ?? null);
        setItems((currentItems) =>
            currentItems.map((item) =>
                item.id === response.data.id ? response.data : item
            )
        );
    }

    const selectedComment =
        items.find((item) => item.id === selectedCommentId) || null;
    const getCategoryLabel = (commentCategory: ClinicianComment["category"]) =>
        ui.categoryOptions.find((option) => option.value === commentCategory)?.label ||
        commentCategory;

    return (
        <section className="mx-auto max-w-5xl px-4 py-8">
            <div className="mb-6 space-y-2">
                <h1 className="text-2xl font-semibold text-gray-900">
                    {ui.pageTitle}
                </h1>
                <p className="text-sm text-gray-600">
                    {ui.pageDescription}
                </p>
                {!isAuthenticated && status !== "loading" && (
                    <p className="text-sm text-amber-700">
                        {ui.guestHint}
                    </p>
                )}
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <form
                    onSubmit={handleSubmit}
                    className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                    <label
                        htmlFor="clinician-comment"
                        className="mb-2 block text-sm font-medium text-gray-800"
                    >
                        {ui.newCommentLabel}
                    </label>
                    {!isAuthenticated && (
                        <div className="mb-3 space-y-3">
                            <label
                                htmlFor="clinician-comment-name"
                                className="mb-2 block text-sm font-medium text-gray-800"
                            >
                                {ui.nameLabel}
                            </label>
                            <input
                                id="clinician-comment-name"
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                                placeholder={ui.namePlaceholder}
                                value={guestDisplayName}
                                onChange={(event) => setGuestDisplayName(event.target.value)}
                                maxLength={120}
                            />
                            <div>
                                <label
                                    htmlFor="clinician-tracking-code"
                                    className="mb-2 block text-sm font-medium text-gray-800"
                                >
                                    {ui.trackingCodeLabel}
                                </label>
                                <input
                                    id="clinician-tracking-code"
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                                    placeholder={ui.trackingCodePlaceholder}
                                    value={trackingCode}
                                    onChange={(event) => setTrackingCode(event.target.value.toUpperCase())}
                                    maxLength={8}
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    {ui.trackingCodeHint}
                                </p>
                            </div>
                        </div>
                    )}
                    <div className="mb-3">
                        <label
                            htmlFor="clinician-comment-category"
                            className="mb-2 block text-sm font-medium text-gray-800"
                        >
                            {ui.categoryLabel}
                        </label>
                        <select
                            id="clinician-comment-category"
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                            value={category}
                            onChange={(event) =>
                                setCategory(
                                    event.target.value as ClinicianComment["category"]
                                )
                            }
                        >
                            {ui.categoryOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <p id="clinician-comment-language-hint" className="mb-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                        {ui.englishOnlyHint}
                    </p>
                    <textarea
                        id="clinician-comment"
                        aria-describedby="clinician-comment-language-hint"
                        lang="en"
                        className="min-h-[220px] w-full rounded-lg border border-gray-300 px-3 py-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                        placeholder={ui.commentPlaceholder}
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        maxLength={500}
                    />
                    <div className="mt-2 text-right text-xs text-gray-500">
                        {comment.length} / 500
                    </div>

                    {error && (
                        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="mt-4">
                            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                                {success}
                            </div>
                            <WriteVerificationReceipt
                                verification={lastWriteVerification}
                                labels={ui.receiptLabels}
                            />
                        </div>
                    )}

                    <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="text-xs text-gray-500">
                            {isAuthenticated
                                ? ui.authenticatedPrivacyHint
                                : ui.guestPrivacyHint}
                        </div>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {submitting ? ui.submittingLabel : ui.submitLabel}
                        </button>
                    </div>
                </form>

                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">
                                {ui.savedCommentsTitle}
                            </h2>
                            <p className="text-xs text-gray-500">
                                {ui.savedCommentsDescription}
                            </p>
                        </div>
                        {canReviewAll && (
                            <div className="flex flex-col gap-2">
                                <select
                                    value={scope}
                                    onChange={(event) => setScope(event.target.value as "own" | "all")}
                                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                                >
                                    <option value="own">{ui.ownScope}</option>
                                    <option value="all">{ui.allScope}</option>
                                </select>
                                <select
                                    value={actorUsernameFilter}
                                    onChange={(event) => setActorUsernameFilter(event.target.value)}
                                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                                >
                                    <option value="">{ui.allActors}</option>
                                    {availableActorUsernames.map((username) => (
                                        <option key={username} value={username}>
                                            {username}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    value={categoryFilter}
                                    onChange={(event) => setCategoryFilter(event.target.value)}
                                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                                >
                                    <option value="">{ui.allCategories}</option>
                                    {ui.categoryOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {!isAuthenticated ? (
                        <p className="text-sm text-gray-500">
                            {ui.loginRequired}
                        </p>
                    ) : loading ? (
                        <p className="text-sm text-gray-500">{ui.loadingComments}</p>
                    ) : items.length === 0 ? (
                        <p className="text-sm text-gray-500">
                            {ui.emptyComments}
                        </p>
                    ) : (
                        <div className="space-y-4">
                            {canReviewAll && items.length > 0 && (
                                <form
                                    onSubmit={handleReplySubmit}
                                    className="rounded-lg border border-sky-100 bg-sky-50 p-4"
                                >
                                    <div className="grid gap-3">
                                        <label className="text-sm font-medium text-gray-800">
                                            {ui.selectedCommentLabel}
                                        </label>
                                        <select
                                            value={selectedCommentId}
                                            onChange={(event) => setSelectedCommentId(event.target.value)}
                                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                                        >
                                            {items.map((item) => (
                                                <option key={item.id} value={item.id}>
                                                    {item.actorUsername} — {getCategoryLabel(item.category)} — {new Date(item.createdAt).toLocaleString(targetLang)}
                                                </option>
                                            ))}
                                        </select>
                                        {selectedComment && (
                                            <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
                                                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                                                    {ui.selectedCommentPreviewTitle}
                                                </div>
                                                <p className="whitespace-pre-wrap">{selectedComment.comment}</p>
                                            </div>
                                        )}
                                        <textarea
                                            className="min-h-[120px] rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                                            placeholder={ui.replyPlaceholder}
                                            value={replyMessage}
                                            onChange={(event) => setReplyMessage(event.target.value)}
                                            maxLength={500}
                                        />
                                        <div className="flex justify-end">
                                            <button
                                                type="submit"
                                                disabled={replying || !selectedCommentId}
                                                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {replying ? ui.submittingLabel : ui.replySubmitLabel}
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            )}

                            {items.map((item) => (
                                <article
                                    key={item.id}
                                    className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                                >
                                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                        <span className="font-medium text-gray-700">
                                            {item.actorUsername}
                                        </span>
                                        <span>{item.actorRole}</span>
                                        <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-800">
                                            {getCategoryLabel(item.category)}
                                        </span>
                                        <span>
                                            {new Date(item.createdAt).toLocaleString(targetLang)}
                                        </span>
                                        {item.redactionCount > 0 && (
                                            <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">
                                                {item.redactionCount} {ui.redactionSuffix}
                                            </span>
                                        )}
                                    </div>
                                    <p className="whitespace-pre-wrap text-sm text-gray-800">
                                        {item.comment}
                                    </p>
                                    {item.replies.length > 0 && (
                                        <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
                                            {item.replies.map((reply) => (
                                                <div
                                                    key={reply.id}
                                                    className="rounded-lg bg-white p-3"
                                                >
                                                    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                                        <span className="font-medium text-gray-700">
                                                            {reply.responderUsername}
                                                        </span>
                                                        <span>{reply.responderRole}</span>
                                                        <span>
                                                            {new Date(reply.createdAt).toLocaleString(targetLang)}
                                                        </span>
                                                    </div>
                                                    <p className="whitespace-pre-wrap text-sm text-gray-800">
                                                        {reply.message}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
