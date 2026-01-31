import { useEffect, useMemo, useState } from "react";
import {
    createClinique,
    deleteClinique,
    fetchCliniquesPaginated,
    type Clinique,
    type CliniquePayload,
    updateClinique,
} from "../services/cliniqueApi";
import type { ApiError } from "../types/api";

/* ------------------------------------------------------------------ */
/* Hook debounce                                                       */
/* ------------------------------------------------------------------ */

function useDebounce<T>(value: T, delay = 300): T {
    const [debounced, setDebounced] = useState<T>(value);

    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(id);
    }, [value, delay]);

    return debounced;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function CliniquesPage() {
    const [cliniques, setCliniques] = useState<Clinique[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<ApiError | null>(null);
    const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const limit = 10;

    const [filterNom, setFilterNom] = useState("");
    const [filterRue, setFilterRue] = useState("");
    const [filterCodePostal, setFilterCodePostal] = useState("");

    const rawFilters = useMemo(
        () => ({
            nom: filterNom,
            rue: filterRue,
            code_postal: filterCodePostal,
        }),
        [filterNom, filterRue, filterCodePostal]
    );

    const filters = useDebounce(rawFilters, 300);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState({
        nom: "",
        num_civique: "",
        rue: "",
        code_postal: "",
        lat: "",
        long: "",
        telephone: "",
        courriel: "",
    });
    const [viewMode, setViewMode] = useState<"create" | "list">("list");

    useEffect(() => {
        loadCliniques();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, page]);

    useEffect(() => {
        setPage(1);
    }, [filters.nom, filters.rue, filters.code_postal]);

    useEffect(() => {
        if (totalPages > 0 && page > totalPages) {
            setPage(totalPages);
            return;
        }
        if (totalPages === 0 && page !== 1) {
            setPage(1);
        }
    }, [page, totalPages]);

    async function loadCliniques() {
        setLoading(true);
        setError(null);

        const response = await fetchCliniquesPaginated({
            page,
            limit,
            rue: filters.rue || undefined,
            code_postal: filters.code_postal || undefined,
            nom: filters.nom || undefined,
        });

        if ("error" in response) {
            setError(response.error);
            setLoading(false);
            return;
        }

        setCliniques(response.data.data);
        setTotalPages(response.data.meta.totalPages);
        setTotalCount(response.data.meta.total);
        setLoading(false);
    }

    function resetForm() {
        setEditingId(null);
        setForm({
            nom: "",
            num_civique: "",
            rue: "",
            code_postal: "",
            lat: "",
            long: "",
            telephone: "",
            courriel: "",
        });
    }

    function markBusy(key: string, busy = true) {
        setBusyIds((prev) => {
            const next = { ...prev };
            if (busy) {
                next[key] = true;
            } else {
                delete next[key];
            }
            return next;
        });
    }

    function buildPayload(): CliniquePayload | null {
        const trimmedNom = form.nom.trim();
        const trimmedNum = form.num_civique.trim();
        const trimmedRue = form.rue.trim();
        const trimmedPostal = form.code_postal.trim();

        if (!trimmedNom || !trimmedNum || !trimmedRue || !trimmedPostal) {
            setError({
                code: "INVALID_INPUT",
                message:
                    "Les champs 'nom', 'num_civique', 'rue' et 'code_postal' sont requis.",
                retryable: false,
            });
            return null;
        }

        const payload: CliniquePayload = {
            nom: trimmedNom,
            num_civique: trimmedNum,
            rue: trimmedRue,
            code_postal: trimmedPostal,
        };

        if (form.lat.trim()) {
            const latValue = Number(form.lat.trim());
            if (!Number.isFinite(latValue)) {
                setError({
                    code: "INVALID_INPUT",
                    message: "Latitude invalide.",
                    retryable: false,
                });
                return null;
            }
            payload.lat = latValue;
        }

        if (form.long.trim()) {
            const longValue = Number(form.long.trim());
            if (!Number.isFinite(longValue)) {
                setError({
                    code: "INVALID_INPUT",
                    message: "Longitude invalide.",
                    retryable: false,
                });
                return null;
            }
            payload.long = longValue;
        }

        if (form.telephone.trim()) {
            payload.telephone = form.telephone.trim();
        }

        if (form.courriel.trim()) {
            payload.courriel = form.courriel.trim().toLowerCase();
        }

        return payload;
    }

    async function handleSubmit() {
        if (busyIds.form) {
            return;
        }

        setError(null);

        const payload = buildPayload();
        if (!payload) {
            return;
        }

        markBusy("form", true);

        const response = editingId
            ? await updateClinique(editingId, payload)
            : await createClinique(payload);

        markBusy("form", false);

        if ("error" in response) {
            setError(response.error);
            return;
        }

        resetForm();
        setPage(1);
        loadCliniques();
    }

    function handleEdit(clinique: Clinique) {
        setViewMode("create");
        setEditingId(clinique._id);
        setForm({
            nom: clinique.nom,
            num_civique: clinique.num_civique,
            rue: clinique.rue,
            code_postal: clinique.code_postal,
            lat: clinique.lat?.toString() ?? "",
            long: clinique.long?.toString() ?? "",
            telephone: clinique.telephone ?? "",
            courriel: clinique.courriel ?? "",
        });
    }

    async function handleDelete(id: string) {
        if (busyIds[id]) {
            return;
        }

        markBusy(id, true);

        const response = await deleteClinique(id);

        markBusy(id, false);

        if ("error" in response) {
            setError(response.error);
            return;
        }

        if (page > 1 && cliniques.length === 1) {
            setPage((prev) => Math.max(prev - 1, 1));
        } else {
            loadCliniques();
        }
    }

    const isFormBusy = Boolean(busyIds.form);

    return (
        <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
            <header className="space-y-2">
                <h1 className="text-2xl font-semibold text-gray-900">
                    Gestion des cliniques
                </h1>
                <p className="text-sm text-gray-600">
                    Créez, modifiez ou supprimez les établissements suivis par
                    ClinIA.
                </p>
            </header>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    className={`px-4 py-2 rounded border font-semibold transition ${
                        viewMode === "create"
                            ? "bg-primary text-white border-primary"
                            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                    onClick={() => setViewMode("create")}
                >
                    Créer une clinique
                </button>
                <button
                    type="button"
                    className={`px-4 py-2 rounded border font-semibold transition ${
                        viewMode === "list"
                            ? "bg-primary text-white border-primary"
                            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                    onClick={() => setViewMode("list")}
                >
                    Rechercher les cliniques
                </button>
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error.message}
                </div>
            )}

            {viewMode === "list" && (
                <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">
                            Filtres
                        </p>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <label className="text-sm text-gray-700">
                                Nom
                                <input
                                    type="text"
                                    className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm"
                                    placeholder="Ex: Clinique Mont-Royal"
                                    value={filterNom}
                                    onChange={(event) =>
                                        setFilterNom(event.target.value)
                                    }
                                />
                            </label>
                            <label className="text-sm text-gray-700">
                                Rue
                                <input
                                    type="text"
                                    className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm"
                                    placeholder="Ex: Rue Saint-Denis"
                                    value={filterRue}
                                    onChange={(event) =>
                                        setFilterRue(event.target.value)
                                    }
                                />
                            </label>
                            <label className="text-sm text-gray-700">
                                Code postal
                                <input
                                    type="text"
                                    className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm"
                                    placeholder="Ex: H2X 1S1"
                                    value={filterCodePostal}
                                    onChange={(event) =>
                                        setFilterCodePostal(event.target.value)
                                    }
                                />
                            </label>
                        </div>
                    </div>
                    <div className="text-sm text-gray-500">
                        {loading ? "Chargement..." : `Page ${page} / ${totalPages}`}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                        <thead>
                            <tr className="text-xs uppercase text-gray-500">
                                <th className="px-3 py-2">Nom</th>
                                <th className="px-3 py-2">Adresse</th>
                                <th className="px-3 py-2">Code postal</th>
                                <th className="px-3 py-2">Téléphone</th>
                                <th className="px-3 py-2">Courriel</th>
                                <th className="px-3 py-2">Latitude</th>
                                <th className="px-3 py-2">Longitude</th>
                                <th className="px-3 py-2">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cliniques.length === 0 && !loading ? (
                                <tr>
                                    <td
                                        colSpan={8}
                                        className="px-3 py-6 text-center text-sm text-gray-500"
                                    >
                                        Aucune clinique trouvée.
                                    </td>
                                </tr>
                            ) : null}
                            {cliniques.map((clinique) => (
                                <tr
                                    key={clinique._id}
                                    className="border-t border-gray-100"
                                >
                                    <td className="px-3 py-3">{clinique.nom}</td>
                                    <td className="px-3 py-3">
                                        {clinique.num_civique} {clinique.rue}
                                    </td>
                                    <td className="px-3 py-3">
                                        {clinique.code_postal}
                                    </td>
                                    <td className="px-3 py-3">
                                        {clinique.telephone ?? "-"}
                                    </td>
                                    <td className="px-3 py-3">
                                        {clinique.courriel ?? "-"}
                                    </td>
                                    <td className="px-3 py-3">
                                        {clinique.lat ?? "-"}
                                    </td>
                                    <td className="px-3 py-3">
                                        {clinique.long ?? "-"}
                                    </td>
                                    <td className="px-3 py-3">
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                className="rounded border border-blue-500 px-3 py-1 text-xs font-medium text-blue-600 transition hover:bg-blue-50 disabled:opacity-50"
                                                onClick={() =>
                                                    handleEdit(clinique)
                                                }
                                            >
                                                Modifier
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded border border-red-500 px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                                                onClick={() =>
                                                    handleDelete(clinique._id)
                                                }
                                                disabled={Boolean(
                                                    busyIds[clinique._id]
                                                )}
                                            >
                                                Supprimer
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="flex items-center justify-between text-sm text-gray-600">
                    <div>
                        {totalCount
                            ? `${totalCount} clinique${
                                  totalCount > 1 ? "s" : ""
                              }`
                            : "Aucune clinique enregistrée"}
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            className="rounded border border-gray-200 px-3 py-1 text-xs font-medium transition hover:border-gray-400 disabled:opacity-50"
                            onClick={() =>
                                setPage((prev) => Math.max(prev - 1, 1))
                            }
                            disabled={page <= 1 || loading}
                        >
                            Précédent
                        </button>
                        <button
                            type="button"
                            className="rounded border border-gray-200 px-3 py-1 text-xs font-medium transition hover:border-gray-400 disabled:opacity-50"
                            onClick={() =>
                                setPage((prev) => Math.min(prev + 1, totalPages))
                            }
                            disabled={page >= totalPages || loading}
                        >
                            Suivant
                        </button>
                    </div>
                </div>
                </section>
            )}

            {viewMode === "create" && (
                <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">
                    {editingId ? "Modifier une clinique" : "Nouvelle clinique"}
                </h2>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm text-gray-700">
                        Nom de la clinique
                        <input
                            type="text"
                            value={form.nom}
                            onChange={(event) =>
                                setForm((prev) => ({
                                    ...prev,
                                    nom: event.target.value,
                                }))
                            }
                            className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm"
                        />
                    </label>
                    <label className="text-sm text-gray-700">
                        Numéro civique
                        <input
                            type="text"
                            value={form.num_civique}
                            onChange={(event) =>
                                setForm((prev) => ({
                                    ...prev,
                                    num_civique: event.target.value,
                                }))
                            }
                            className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm"
                        />
                    </label>
                    <label className="text-sm text-gray-700">
                        Rue
                        <input
                            type="text"
                            value={form.rue}
                            onChange={(event) =>
                                setForm((prev) => ({
                                    ...prev,
                                    rue: event.target.value,
                                }))
                            }
                            className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm"
                        />
                    </label>
                    <label className="text-sm text-gray-700">
                        Code postal
                        <input
                            type="text"
                            value={form.code_postal}
                            onChange={(event) =>
                                setForm((prev) => ({
                                    ...prev,
                                    code_postal: event.target.value,
                                }))
                            }
                            className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm"
                        />
                    </label>
                    <label className="text-sm text-gray-700">
                        Téléphone
                        <input
                            type="text"
                            value={form.telephone}
                            onChange={(event) =>
                                setForm((prev) => ({
                                    ...prev,
                                    telephone: event.target.value,
                                }))
                            }
                            className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm"
                        />
                    </label>
                    <label className="text-sm text-gray-700">
                        Courriel
                        <input
                            type="email"
                            value={form.courriel}
                            onChange={(event) =>
                                setForm((prev) => ({
                                    ...prev,
                                    courriel: event.target.value,
                                }))
                            }
                            className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm"
                        />
                    </label>
                    <label className="text-sm text-gray-700">
                        Latitude
                        <input
                            type="number"
                            value={form.lat}
                            onChange={(event) =>
                                setForm((prev) => ({
                                    ...prev,
                                    lat: event.target.value,
                                }))
                            }
                            className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm"
                        />
                    </label>
                    <label className="text-sm text-gray-700">
                        Longitude
                        <input
                            type="number"
                            value={form.long}
                            onChange={(event) =>
                                setForm((prev) => ({
                                    ...prev,
                                    long: event.target.value,
                                }))
                            }
                            className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm"
                        />
                    </label>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isFormBusy}
                        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
                    >
                        Enregistrer
                    </button>
                    {editingId && (
                        <button
                            type="button"
                            onClick={resetForm}
                            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-400"
                        >
                            Annuler
                        </button>
                    )}
                </div>
                </section>
            )}
        </div>
    );
}
