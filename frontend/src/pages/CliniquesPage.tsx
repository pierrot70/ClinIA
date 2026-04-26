import { useContext, useEffect, useMemo, useState } from "react";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { useTranslation } from "../hooks/useTranslation";
import { labels } from "../i18n/uiLabels";
import {
    createClinique,
    deleteClinique,
    fetchCliniquesPaginated,
    type Clinique,
    type CliniquePayload,
    updateClinique,
} from "../services/cliniqueApi";
import type { ApiError } from "../types/api";

function useCliniquesPageLabels(targetLang: string) {
    const source = labels.cliniquesPage;
    const options = { targetLang, namespace: "cliniques-page" };

    const { translated: title } = useTranslation({ text: source.header.title, ...options });
    const { translated: description } = useTranslation({ text: source.header.description, ...options });
    const { translated: createTab } = useTranslation({ text: source.tabs.create, ...options });
    const { translated: searchTab } = useTranslation({ text: source.tabs.search, ...options });
    const { translated: requiredFields } = useTranslation({ text: source.validation.requiredFields, ...options });
    const { translated: invalidLatitude } = useTranslation({ text: source.validation.invalidLatitude, ...options });
    const { translated: invalidLongitude } = useTranslation({ text: source.validation.invalidLongitude, ...options });
    const { translated: filtersTitle } = useTranslation({ text: source.filters.title, ...options });
    const { translated: filterNameLabel } = useTranslation({ text: source.filters.nameLabel, ...options });
    const { translated: filterNamePlaceholder } = useTranslation({ text: source.filters.namePlaceholder, ...options });
    const { translated: filterStreetLabel } = useTranslation({ text: source.filters.streetLabel, ...options });
    const { translated: filterStreetPlaceholder } = useTranslation({ text: source.filters.streetPlaceholder, ...options });
    const { translated: filterPostalCodeLabel } = useTranslation({ text: source.filters.postalCodeLabel, ...options });
    const { translated: filterPostalCodePlaceholder } = useTranslation({ text: source.filters.postalCodePlaceholder, ...options });
    const { translated: tableName } = useTranslation({ text: source.table.name, ...options });
    const { translated: tableAddress } = useTranslation({ text: source.table.address, ...options });
    const { translated: tablePostalCode } = useTranslation({ text: source.table.postalCode, ...options });
    const { translated: tablePhone } = useTranslation({ text: source.table.phone, ...options });
    const { translated: tableEmail } = useTranslation({ text: source.table.email, ...options });
    const { translated: tableLatitude } = useTranslation({ text: source.table.latitude, ...options });
    const { translated: tableLongitude } = useTranslation({ text: source.table.longitude, ...options });
    const { translated: tableActions } = useTranslation({ text: source.table.actions, ...options });
    const { translated: tableEmpty } = useTranslation({ text: source.table.empty, ...options });
    const { translated: edit } = useTranslation({ text: source.table.edit, ...options });
    const { translated: deleteLabel } = useTranslation({ text: source.table.delete, ...options });
    const { translated: summaryEmpty } = useTranslation({ text: source.summary.empty, ...options });
    const { translated: summarySingularSuffix } = useTranslation({ text: source.summary.singularSuffix, ...options });
    const { translated: summaryPluralSuffix } = useTranslation({ text: source.summary.pluralSuffix, ...options });
    const { translated: editTitle } = useTranslation({ text: source.form.editTitle, ...options });
    const { translated: createTitle } = useTranslation({ text: source.form.createTitle, ...options });
    const { translated: nameLabel } = useTranslation({ text: source.form.nameLabel, ...options });
    const { translated: civicNumberLabel } = useTranslation({ text: source.form.civicNumberLabel, ...options });
    const { translated: streetLabel } = useTranslation({ text: source.form.streetLabel, ...options });
    const { translated: postalCodeLabel } = useTranslation({ text: source.form.postalCodeLabel, ...options });
    const { translated: phoneLabel } = useTranslation({ text: source.form.phoneLabel, ...options });
    const { translated: emailLabel } = useTranslation({ text: source.form.emailLabel, ...options });
    const { translated: latitudeLabel } = useTranslation({ text: source.form.latitudeLabel, ...options });
    const { translated: longitudeLabel } = useTranslation({ text: source.form.longitudeLabel, ...options });
    const { translated: save } = useTranslation({ text: source.form.save, ...options });
    const { translated: cancel } = useTranslation({ text: source.form.cancel, ...options });
    const { translated: loading } = useTranslation({ text: source.pagination.loading, ...options });
    const { translated: previous } = useTranslation({ text: source.pagination.previous, ...options });
    const { translated: next } = useTranslation({ text: source.pagination.next, ...options });
    const { translated: pagePrefix } = useTranslation({ text: source.pagination.pagePrefix, ...options });
    const { translated: pageSeparator } = useTranslation({ text: source.pagination.pageSeparator, ...options });

    return {
        title,
        description,
        createTab,
        searchTab,
        requiredFields,
        invalidLatitude,
        invalidLongitude,
        filtersTitle,
        filterNameLabel,
        filterNamePlaceholder,
        filterStreetLabel,
        filterStreetPlaceholder,
        filterPostalCodeLabel,
        filterPostalCodePlaceholder,
        tableName,
        tableAddress,
        tablePostalCode,
        tablePhone,
        tableEmail,
        tableLatitude,
        tableLongitude,
        tableActions,
        tableEmpty,
        edit,
        deleteLabel,
        summaryEmpty,
        summarySingularSuffix,
        summaryPluralSuffix,
        editTitle,
        createTitle,
        nameLabel,
        civicNumberLabel,
        streetLabel,
        postalCodeLabel,
        phoneLabel,
        emailLabel,
        latitudeLabel,
        longitudeLabel,
        save,
        cancel,
        loading,
        previous,
        next,
        pagePrefix,
        pageSeparator,
    };
}

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
    const i18n = useContext(HomeI18nContext) || { locale: "fr" };
    const pageLabels = useCliniquesPageLabels(i18n.locale);
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
                message: pageLabels.requiredFields,
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
                    message: pageLabels.invalidLatitude,
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
                    message: pageLabels.invalidLongitude,
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
                    {pageLabels.title}
                </h1>
                <p className="text-sm text-gray-600">
                    {pageLabels.description}
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
                    {pageLabels.createTab}
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
                    {pageLabels.searchTab}
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
                            {pageLabels.filtersTitle}
                        </p>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <label className="text-sm text-gray-700">
                                {pageLabels.filterNameLabel}
                                <input
                                    type="text"
                                    className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm"
                                    placeholder={pageLabels.filterNamePlaceholder}
                                    value={filterNom}
                                    onChange={(event) =>
                                        setFilterNom(event.target.value)
                                    }
                                />
                            </label>
                            <label className="text-sm text-gray-700">
                                {pageLabels.filterStreetLabel}
                                <input
                                    type="text"
                                    className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm"
                                    placeholder={pageLabels.filterStreetPlaceholder}
                                    value={filterRue}
                                    onChange={(event) =>
                                        setFilterRue(event.target.value)
                                    }
                                />
                            </label>
                            <label className="text-sm text-gray-700">
                                {pageLabels.filterPostalCodeLabel}
                                <input
                                    type="text"
                                    className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm"
                                    placeholder={pageLabels.filterPostalCodePlaceholder}
                                    value={filterCodePostal}
                                    onChange={(event) =>
                                        setFilterCodePostal(event.target.value)
                                    }
                                />
                            </label>
                        </div>
                    </div>
                    <div className="text-sm text-gray-500">
                        {loading
                            ? pageLabels.loading
                            : `${pageLabels.pagePrefix} ${page} ${pageLabels.pageSeparator} ${totalPages}`}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                        <thead>
                            <tr className="text-xs uppercase text-gray-500">
                                <th className="px-3 py-2">{pageLabels.tableName}</th>
                                <th className="px-3 py-2">{pageLabels.tableAddress}</th>
                                <th className="px-3 py-2">{pageLabels.tablePostalCode}</th>
                                <th className="px-3 py-2">{pageLabels.tablePhone}</th>
                                <th className="px-3 py-2">{pageLabels.tableEmail}</th>
                                <th className="px-3 py-2">{pageLabels.tableLatitude}</th>
                                <th className="px-3 py-2">{pageLabels.tableLongitude}</th>
                                <th className="px-3 py-2">{pageLabels.tableActions}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cliniques.length === 0 && !loading ? (
                                <tr>
                                    <td
                                        colSpan={8}
                                        className="px-3 py-6 text-center text-sm text-gray-500"
                                    >
                                        {pageLabels.tableEmpty}
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
                                                {pageLabels.edit}
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
                                                {pageLabels.deleteLabel}
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
                            ? `${totalCount} ${
                                  totalCount > 1
                                      ? pageLabels.summaryPluralSuffix
                                      : pageLabels.summarySingularSuffix
                              }`
                            : pageLabels.summaryEmpty}
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
                            {pageLabels.previous}
                        </button>
                        <button
                            type="button"
                            className="rounded border border-gray-200 px-3 py-1 text-xs font-medium transition hover:border-gray-400 disabled:opacity-50"
                            onClick={() =>
                                setPage((prev) => Math.min(prev + 1, totalPages))
                            }
                            disabled={page >= totalPages || loading}
                        >
                            {pageLabels.next}
                        </button>
                    </div>
                </div>
                </section>
            )}

            {viewMode === "create" && (
                <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">
                    {editingId ? pageLabels.editTitle : pageLabels.createTitle}
                </h2>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm text-gray-700">
                        {pageLabels.nameLabel}
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
                        {pageLabels.civicNumberLabel}
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
                        {pageLabels.streetLabel}
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
                        {pageLabels.postalCodeLabel}
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
                        {pageLabels.phoneLabel}
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
                        {pageLabels.emailLabel}
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
                        {pageLabels.latitudeLabel}
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
                        {pageLabels.longitudeLabel}
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
                        {pageLabels.save}
                    </button>
                    {editingId && (
                        <button
                            type="button"
                            onClick={resetForm}
                            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-400"
                        >
                            {pageLabels.cancel}
                        </button>
                    )}
                </div>
                </section>
            )}
        </div>
    );
}
