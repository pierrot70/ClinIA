import React, { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import {
    createClinicianComment,
    listClinicianComments,
    replyToClinicianComment,
    type ClinicianComment,
} from "../services/clinicianCommentsApi";

const CLINICIAN_COMMENT_STORAGE_KEY = "clinia_comment_tracking";

export function ClinicianCommentsPage() {
    const { user, isAuthenticated, status } = useAuth();
    const canReviewAll = user?.role === "ADMIN" || user?.role === "SUPERADMIN";
    const [scope, setScope] = useState<"own" | "all">("own");
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

            const response = await listClinicianComments(scope, actorUsernameFilter);
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
    }, [actorUsernameFilter, isAuthenticated, scope]);

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

        const response = await createClinicianComment(
            comment,
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
            `${response.data.redactionCount > 0
                ? "Commentaire enregistre avec obfuscation automatique des identifiants detectes."
                : "Commentaire enregistre."} Code de suivi: ${response.data.trackingCode || trackingCode}`
        );

        if (isAuthenticated) {
            const refreshed = await listClinicianComments(scope, actorUsernameFilter);
            if (refreshed.ok) {
                setItems(refreshed.data.items || []);
                setAvailableActorUsernames(refreshed.data.availableActorUsernames || []);
            }
        }
    }

    async function handleReplySubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!selectedCommentId) {
            setError("Selectionnez un commentaire avant de repondre.");
            return;
        }

        setReplying(true);
        setError("");
        setSuccess("");

        const response = await replyToClinicianComment(selectedCommentId, replyMessage);
        setReplying(false);

        if (!response.ok) {
            setError(response.error.message);
            return;
        }

        setReplyMessage("");
        setSuccess("Reponse enregistree.");
        setItems((currentItems) =>
            currentItems.map((item) =>
                item.id === response.data.id ? response.data : item
            )
        );
    }

    const selectedComment =
        items.find((item) => item.id === selectedCommentId) || null;

    return (
        <section className="mx-auto max-w-5xl px-4 py-8">
            <div className="mb-6 space-y-2">
                <h1 className="text-2xl font-semibold text-gray-900">
                    Commentaires medecins
                </h1>
                <p className="text-sm text-gray-600">
                    Utilisez cet espace pour laisser des commentaires de support ou de suivi.
                    N'inserez jamais de donnees permettant d'identifier un patient. Les
                    emails, telephones, RAMQ, SSN/NAS et certaines valeurs libellees sont
                    obfusques automatiquement avant sauvegarde.
                </p>
                {!isAuthenticated && status !== "loading" && (
                    <p className="text-sm text-amber-700">
                        Vous pouvez laisser un commentaire sans connexion. Ajoutez simplement
                        votre nom ou un pseudonyme professionnel.
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
                        Nouveau commentaire
                    </label>
                    {!isAuthenticated && (
                        <div className="mb-3 space-y-3">
                            <label
                                htmlFor="clinician-comment-name"
                                className="mb-2 block text-sm font-medium text-gray-800"
                            >
                                Nom ou pseudonyme
                            </label>
                            <input
                                id="clinician-comment-name"
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                                placeholder="Exemple: dr.lasante"
                                value={guestDisplayName}
                                onChange={(event) => setGuestDisplayName(event.target.value)}
                                maxLength={120}
                            />
                            <div>
                                <label
                                    htmlFor="clinician-tracking-code"
                                    className="mb-2 block text-sm font-medium text-gray-800"
                                >
                                    Code de suivi
                                </label>
                                <input
                                    id="clinician-tracking-code"
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                                    placeholder="Genere automatiquement au premier commentaire"
                                    value={trackingCode}
                                    onChange={(event) => setTrackingCode(event.target.value.toUpperCase())}
                                    maxLength={8}
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Laissez vide pour recevoir un nouveau code de suivi, ou
                                    reutilisez votre code actuel pour regrouper vos commentaires.
                                </p>
                            </div>
                        </div>
                    )}
                    <textarea
                        id="clinician-comment"
                        className="min-h-[220px] w-full rounded-lg border border-gray-300 px-3 py-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                        placeholder="Exemple: Le module de rendez-vous affiche une erreur au moment de confirmer l'horaire. Ne pas inclure de nom de patient, RAMQ, telephone ou email."
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
                        <div className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                            {success}
                        </div>
                    )}

                    <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="text-xs text-gray-500">
                            {isAuthenticated
                                ? "Votre nom d'usager et la date/heure seront sauvegardes avec le commentaire obfusque."
                                : "Votre nom ou pseudonyme, la date/heure et le commentaire obfusque seront sauvegardes."}
                        </div>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {submitting ? "Enregistrement..." : "Enregistrer le commentaire"}
                        </button>
                    </div>
                </form>

                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">
                                Commentaires sauvegardes
                            </h2>
                            <p className="text-xs text-gray-500">
                                Les commentaires sont affiches tels qu'ils ont ete sauvegardes
                                apres obfuscation.
                            </p>
                        </div>
                        {canReviewAll && (
                            <div className="flex flex-col gap-2">
                                <select
                                    value={scope}
                                    onChange={(event) => setScope(event.target.value as "own" | "all")}
                                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                                >
                                    <option value="own">Mes commentaires</option>
                                    <option value="all">Tous les commentaires</option>
                                </select>
                                <select
                                    value={actorUsernameFilter}
                                    onChange={(event) => setActorUsernameFilter(event.target.value)}
                                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                                >
                                    <option value="">Tous les noms ou pseudonymes</option>
                                    {availableActorUsernames.map((username) => (
                                        <option key={username} value={username}>
                                            {username}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {!isAuthenticated ? (
                        <p className="text-sm text-gray-500">
                            Connectez-vous pour consulter l'historique des commentaires.
                        </p>
                    ) : loading ? (
                        <p className="text-sm text-gray-500">Chargement des commentaires...</p>
                    ) : items.length === 0 ? (
                        <p className="text-sm text-gray-500">
                            Aucun commentaire enregistre pour le moment.
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
                                            Selection du commentaire
                                        </label>
                                        <select
                                            value={selectedCommentId}
                                            onChange={(event) => setSelectedCommentId(event.target.value)}
                                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                                        >
                                            {items.map((item) => (
                                                <option key={item.id} value={item.id}>
                                                    {item.actorUsername} — {new Date(item.createdAt).toLocaleString("fr-CA")}
                                                </option>
                                            ))}
                                        </select>
                                        {selectedComment && (
                                            <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
                                                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                                                    Commentaire selectionne
                                                </div>
                                                <p className="whitespace-pre-wrap">{selectedComment.comment}</p>
                                            </div>
                                        )}
                                        <textarea
                                            className="min-h-[120px] rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                                            placeholder="Ecrire une reponse au commentaire selectionne..."
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
                                                {replying ? "Enregistrement..." : "Repondre au commentaire"}
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
                                        <span>
                                            {new Date(item.createdAt).toLocaleString("fr-CA")}
                                        </span>
                                        {item.redactionCount > 0 && (
                                            <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">
                                                {item.redactionCount} obfuscation(s)
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
                                                            {new Date(reply.createdAt).toLocaleString("fr-CA")}
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
