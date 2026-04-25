import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
    deleteTranslationCacheEntry,
    fetchTranslationCache,
    updateTranslationCacheEntry,
    type TranslationCacheEntry,
} from "../services/translationAdminApi";
import type { ApiError } from "../types/api";

const PAGE_LIMIT = 20;

function formatDate(value?: string) {
    if (!value) {
        return "-";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

function formatPayload(payload: Record<string, unknown>) {
    return JSON.stringify(payload || {}, null, 2);
}

export function TranslationAdminPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [translations, setTranslations] = useState<TranslationCacheEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [error, setError] = useState<ApiError | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draftSourceText, setDraftSourceText] = useState("");
    const [draftPayload, setDraftPayload] = useState("");
    const [draftError, setDraftError] = useState<string | null>(null);

    const filters = useMemo(() => {
        const pageValue = Number.parseInt(searchParams.get("page") || "1", 10);
        return {
            page: Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1,
            limit: PAGE_LIMIT,
            namespace: searchParams.get("namespace") || "",
            sourceLocale: searchParams.get("sourceLocale") || "",
            targetLang: searchParams.get("targetLang") || "",
            search: searchParams.get("search") || "",
        };
    }, [searchParams]);

    const [draftFilters, setDraftFilters] = useState(filters);

    useEffect(() => {
        setDraftFilters(filters);
    }, [filters]);

    useEffect(() => {
        void loadTranslations();
    }, [filters]);

    async function loadTranslations() {
        setLoading(true);
        setError(null);
        setNotice(null);

        const response = await fetchTranslationCache(filters);
        if ("error" in response) {
            setError(response.error);
            setTranslations([]);
            setLoading(false);
            return;
        }

        setTranslations(response.data.translations);
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

    function resetFilters() {
        setDraftFilters({
            page: 1,
            limit: PAGE_LIMIT,
            namespace: "",
            sourceLocale: "",
            targetLang: "",
            search: "",
        });
        setSearchParams({ page: "1" });
    }

    function setPage(page: number) {
        const next = new URLSearchParams(searchParams);
        next.set("page", String(page));
        setSearchParams(next);
    }

    function startEditing(entry: TranslationCacheEntry) {
        setEditingId(entry.id);
        setDraftSourceText(entry.sourceText || "");
        setDraftPayload(formatPayload(entry.payload));
        setDraftError(null);
        setNotice(null);
    }

    function cancelEditing() {
        setEditingId(null);
        setDraftSourceText("");
        setDraftPayload("");
        setDraftError(null);
    }

    async function saveEditing(entry: TranslationCacheEntry) {
        setDraftError(null);
        setNotice(null);

        let parsed: Record<string, unknown>;
        try {
            const value = JSON.parse(draftPayload);
            if (!value || typeof value !== "object" || Array.isArray(value)) {
                throw new Error("Payload object required");
            }
            parsed = value as Record<string, unknown>;
        } catch {
            setDraftError("Le payload doit etre un objet JSON valide.");
            return;
        }

        setSavingId(entry.id);
        const response = await updateTranslationCacheEntry({
            id: entry.id,
            sourceText: draftSourceText,
            payload: parsed,
        });
        setSavingId(null);

        if ("error" in response) {
            setDraftError(response.error.message);
            return;
        }

        setTranslations((current) =>
            current.map((item) =>
                item.id === entry.id ? response.data.translation : item
            )
        );
        setNotice("Traduction sauvegardee.");
        cancelEditing();
    }

    async function deleteEntry(entry: TranslationCacheEntry) {
        const confirmed = window.confirm(
            "Supprimer cette traduction du cache? Elle pourra etre regeneree au prochain besoin."
        );
        if (!confirmed) {
            return;
        }

        setDeletingId(entry.id);
        setNotice(null);
        const response = await deleteTranslationCacheEntry(entry.id);
        setDeletingId(null);

        if ("error" in response) {
            setError(response.error);
            return;
        }

        setTranslations((current) => current.filter((item) => item.id !== entry.id));
        setTotal((current) => Math.max(0, current - 1));
        setNotice("Traduction supprimee du cache.");
    }

    return (
        <section className="mx-auto max-w-7xl px-4 py-8">
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">
                        Translation Admin
                    </h1>
                    <p className="text-sm text-gray-600">
                        Gestion SUPERADMIN du cache de traductions UI.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void loadTranslations()}
                    className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                    Rafraichir
                </button>
            </div>

            <div className="mb-5 grid gap-3 border-y border-gray-200 py-4 md:grid-cols-5">
                <label className="text-sm text-gray-700">
                    Namespace
                    <input
                        className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                        value={draftFilters.namespace}
                        onChange={(event) =>
                            updateDraftFilter("namespace", event.target.value)
                        }
                        placeholder="clinical-demo"
                    />
                </label>
                <label className="text-sm text-gray-700">
                    Source
                    <input
                        className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                        value={draftFilters.sourceLocale}
                        onChange={(event) =>
                            updateDraftFilter("sourceLocale", event.target.value)
                        }
                        placeholder="fr"
                    />
                </label>
                <label className="text-sm text-gray-700">
                    Cible
                    <input
                        className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                        value={draftFilters.targetLang}
                        onChange={(event) =>
                            updateDraftFilter("targetLang", event.target.value)
                        }
                        placeholder="en"
                    />
                </label>
                <label className="text-sm text-gray-700 md:col-span-2">
                    Recherche
                    <input
                        className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                        value={draftFilters.search}
                        onChange={(event) =>
                            updateDraftFilter("search", event.target.value)
                        }
                        placeholder="Texte source ou hash"
                    />
                </label>
                <div className="flex items-end gap-2 md:col-span-5">
                    <button
                        type="button"
                        onClick={applyFilters}
                        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                        Appliquer
                    </button>
                    <button
                        type="button"
                        onClick={resetFilters}
                        className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                        Reinitialiser
                    </button>
                </div>
            </div>

            {notice && (
                <div className="mb-4 border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                    {notice}
                </div>
            )}

            {error && (
                <div className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {error.message}
                </div>
            )}

            <div className="mb-3 flex items-center justify-between text-sm text-gray-600">
                <span>{loading ? "Chargement..." : `${total} traduction(s)`}</span>
                <span>
                    Page {filters.page} / {totalPages}
                </span>
            </div>

            <div className="overflow-x-auto border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                        <tr>
                            <th className="px-3 py-2">Source</th>
                            <th className="px-3 py-2">Langue</th>
                            <th className="px-3 py-2">Payload</th>
                            <th className="px-3 py-2">Meta</th>
                            <th className="px-3 py-2 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                        {translations.map((entry) => {
                            const isEditing = editingId === entry.id;
                            return (
                                <tr key={entry.id} className="align-top">
                                    <td className="max-w-xs px-3 py-3">
                                        {isEditing ? (
                                            <textarea
                                                className="min-h-24 w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
                                                value={draftSourceText}
                                                onChange={(event) =>
                                                    setDraftSourceText(event.target.value)
                                                }
                                            />
                                        ) : (
                                            <div>
                                                <div className="font-medium text-gray-900">
                                                    {entry.sourceText || "(source non stockee)"}
                                                </div>
                                                <div className="mt-1 break-all font-mono text-xs text-gray-500">
                                                    {entry.sourceHash}
                                                </div>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-3 py-3">
                                        <div className="font-medium text-gray-900">
                                            {entry.sourceLocale} → {entry.targetLang}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {entry.namespace}
                                        </div>
                                    </td>
                                    <td className="min-w-[320px] px-3 py-3">
                                        {isEditing ? (
                                            <div>
                                                <textarea
                                                    className="min-h-44 w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
                                                    value={draftPayload}
                                                    onChange={(event) =>
                                                        setDraftPayload(event.target.value)
                                                    }
                                                />
                                                {draftError && (
                                                    <p className="mt-1 text-xs text-red-700">
                                                        {draftError}
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 font-mono text-xs text-gray-800">
                                                {formatPayload(entry.payload)}
                                            </pre>
                                        )}
                                    </td>
                                    <td className="px-3 py-3 text-xs text-gray-600">
                                        <div>Modele: {entry.model}</div>
                                        <div>MAJ: {formatDate(entry.updatedAt)}</div>
                                    </td>
                                    <td className="px-3 py-3 text-right">
                                        {isEditing ? (
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => void saveEditing(entry)}
                                                    disabled={savingId === entry.id}
                                                    className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                                                >
                                                    {savingId === entry.id
                                                        ? "Sauvegarde..."
                                                        : "Sauver"}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={cancelEditing}
                                                    className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                                >
                                                    Annuler
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => startEditing(entry)}
                                                    className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                                >
                                                    Modifier
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void deleteEntry(entry)}
                                                    disabled={deletingId === entry.id}
                                                    className="rounded border border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                                                >
                                                    {deletingId === entry.id
                                                        ? "Suppression..."
                                                        : "Supprimer"}
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {!loading && translations.length === 0 && (
                            <tr>
                                <td
                                    colSpan={5}
                                    className="px-3 py-8 text-center text-sm text-gray-500"
                                >
                                    Aucune traduction trouvee.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
                <button
                    type="button"
                    disabled={filters.page <= 1}
                    onClick={() => setPage(filters.page - 1)}
                    className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    Precedent
                </button>
                <button
                    type="button"
                    disabled={filters.page >= totalPages}
                    onClick={() => setPage(filters.page + 1)}
                    className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    Suivant
                </button>
            </div>
        </section>
    );
}
