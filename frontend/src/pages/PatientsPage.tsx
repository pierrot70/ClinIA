import { useContext, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { labels } from "../i18n/uiLabels";
import { useTranslation } from "../hooks/useTranslation";
import {
    createPatient,
    deletePatient,
    fetchPatientsPaginated,
    updatePatient,
    type Patient,
    type PatientLanguage,
    type PatientPayload,
} from "../services/patientsApi";
import type { ApiError } from "../types/api";
import type { WriteVerificationMeta } from "../types/api";
import { useDebounce } from "../hooks/useDebounce";
import { SaveFeedback } from "../components/system/SaveFeedback";
import {
    formatWriteVerificationMessage,
    WriteVerificationReceipt,
} from "../components/system/WriteVerificationReceipt";
import { PatientClinicalNotesModal } from "../components/clinical/PatientClinicalNotesModal";

function usePatientsPageLabels(targetLang: string) {
    const source = labels.patientsPage;
    const options = { targetLang, namespace: "patients-page" };

    const { translated: title } = useTranslation({ text: source.title, ...options });
    const { translated: createTab } = useTranslation({ text: source.tabs.create, ...options });
    const { translated: searchTab } = useTranslation({ text: source.tabs.search, ...options });
    const { translated: invalidServerResponse } = useTranslation({ text: source.validation.invalidServerResponse, ...options });
    const { translated: invalidLatitude } = useTranslation({ text: source.validation.invalidLatitude, ...options });
    const { translated: invalidLongitude } = useTranslation({ text: source.validation.invalidLongitude, ...options });
    const { translated: requiredName } = useTranslation({ text: source.validation.requiredName, ...options });
    const { translated: invalidCoordinates } = useTranslation({ text: source.validation.invalidCoordinates, ...options });
    const { translated: deleteConfirm } = useTranslation({ text: source.validation.deleteConfirm, ...options });
    const { translated: restrictedAccess } = useTranslation({ text: source.validation.restrictedAccess, ...options });
    const { translated: editTitle } = useTranslation({ text: source.form.editTitle, ...options });
    const { translated: createTitle } = useTranslation({ text: source.form.createTitle, ...options });
    const { translated: firstNamePlaceholder } = useTranslation({ text: source.form.firstNamePlaceholder, ...options });
    const { translated: lastNamePlaceholder } = useTranslation({ text: source.form.lastNamePlaceholder, ...options });
    const { translated: ramqPlaceholder } = useTranslation({ text: source.form.ramqPlaceholder, ...options });
    const { translated: phonePlaceholder } = useTranslation({ text: source.form.phonePlaceholder, ...options });
    const { translated: emailPlaceholder } = useTranslation({ text: source.form.emailPlaceholder, ...options });
    const { translated: addressPlaceholder } = useTranslation({ text: source.form.addressPlaceholder, ...options });
    const { translated: languageLabel } = useTranslation({ text: source.form.languageLabel, ...options });
    const { translated: latitudePlaceholder } = useTranslation({ text: source.form.latitudePlaceholder, ...options });
    const { translated: longitudePlaceholder } = useTranslation({ text: source.form.longitudePlaceholder, ...options });
    const { translated: smsEnabled } = useTranslation({ text: source.form.smsEnabled, ...options });
    const { translated: save } = useTranslation({ text: source.form.save, ...options });
    const { translated: saving } = useTranslation({ text: source.form.saving, ...options });
    const { translated: create } = useTranslation({ text: source.form.create, ...options });
    const { translated: creating } = useTranslation({ text: source.form.creating, ...options });
    const { translated: cancel } = useTranslation({ text: source.form.cancel, ...options });
    const { translated: statusCreating } = useTranslation({ text: source.status.creating, ...options });
    const { translated: statusUpdating } = useTranslation({ text: source.status.updating, ...options });
    const { translated: statusDeleting } = useTranslation({ text: source.status.deleting, ...options });
    const { translated: statusCreated } = useTranslation({ text: source.status.created, ...options });
    const { translated: statusUpdated } = useTranslation({ text: source.status.updated, ...options });
    const { translated: statusDeleted } = useTranslation({ text: source.status.deleted, ...options });
    const { translated: statusFailed } = useTranslation({ text: source.status.failed, ...options });
    const { translated: searchTitle } = useTranslation({ text: source.search.title, ...options });
    const { translated: filterLastNamePlaceholder } = useTranslation({ text: source.search.lastNamePlaceholder, ...options });
    const { translated: filterFirstNamePlaceholder } = useTranslation({ text: source.search.firstNamePlaceholder, ...options });
    const { translated: filterAddressPlaceholder } = useTranslation({ text: source.search.addressPlaceholder, ...options });
    const { translated: filterPhonePlaceholder } = useTranslation({ text: source.search.phonePlaceholder, ...options });
    const { translated: filterRamqPlaceholder } = useTranslation({ text: source.search.ramqPlaceholder, ...options });
    const { translated: empty } = useTranslation({ text: source.search.empty, ...options });
    const { translated: tableLastName } = useTranslation({ text: source.table.lastName, ...options });
    const { translated: tableFirstName } = useTranslation({ text: source.table.firstName, ...options });
    const { translated: tableAddress } = useTranslation({ text: source.table.address, ...options });
    const { translated: tablePhone } = useTranslation({ text: source.table.phone, ...options });
    const { translated: tableRamq } = useTranslation({ text: source.table.ramq, ...options });
    const { translated: tableActions } = useTranslation({ text: source.table.actions, ...options });
    const { translated: tableLoading } = useTranslation({ text: source.table.loading, ...options });
    const { translated: createAppointment } = useTranslation({ text: source.table.createAppointment, ...options });
    const { translated: edit } = useTranslation({ text: source.table.edit, ...options });
    const { translated: deleteLabel } = useTranslation({ text: source.table.delete, ...options });
    const { translated: previous } = useTranslation({ text: source.pagination.previous, ...options });
    const { translated: next } = useTranslation({ text: source.pagination.next, ...options });
    const { translated: pagePrefix } = useTranslation({ text: source.pagination.pagePrefix, ...options });
    const { translated: pageSeparator } = useTranslation({ text: source.pagination.pageSeparator, ...options });

    return {
        title,
        createTab,
        searchTab,
        invalidServerResponse,
        invalidLatitude,
        invalidLongitude,
        requiredName,
        invalidCoordinates,
        deleteConfirm,
        restrictedAccess,
        editTitle,
        createTitle,
        firstNamePlaceholder,
        lastNamePlaceholder,
        ramqPlaceholder,
        phonePlaceholder,
        emailPlaceholder,
        addressPlaceholder,
        languageLabel,
        languageOptions: source.form.languageOptions,
        latitudePlaceholder,
        longitudePlaceholder,
        smsEnabled,
        save,
        saving,
        create,
        creating,
        cancel,
        statusCreating,
        statusUpdating,
        statusDeleting,
        statusCreated,
        statusUpdated,
        statusDeleted,
        statusFailed,
        searchTitle,
        filterLastNamePlaceholder,
        filterFirstNamePlaceholder,
        filterAddressPlaceholder,
        filterPhonePlaceholder,
        filterRamqPlaceholder,
        empty,
        tableLastName,
        tableFirstName,
        tableAddress,
        tablePhone,
        tableRamq,
        tableActions,
        tableLoading,
        createAppointment,
        edit,
        deleteLabel,
        previous,
        next,
        pagePrefix,
        pageSeparator,
    };
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function PatientsPage() {
    const i18n = useContext(HomeI18nContext) || { locale: "fr" };
    const targetLang = i18n.locale;
    const ui = usePatientsPageLabels(targetLang);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<ApiError | null>(null);
    const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
    const [formSaving, setFormSaving] = useState(false);
    const [saveFeedback, setSaveFeedback] = useState<{
        type: "info" | "success" | "error";
        message: string;
    } | null>(null);
    const [lastWriteVerification, setLastWriteVerification] =
        useState<WriteVerificationMeta | null>(null);

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const limit = 10;

    const [filterNom, setFilterNom] = useState("");
    const [filterPrenom, setFilterPrenom] = useState("");
    const [filterAddresse, setFilterAddresse] = useState("");
    const [filterTelephone, setFilterTelephone] = useState("");
    const [filterRamq, setFilterRamq] = useState("");
    const [sortBy, setSortBy] = useState<
        "nom" | "prenom" | "addresse" | "telephone" | "num_assurance_maladie"
    >("nom");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

    const rawFilters = useMemo(
        () => ({
            nom: filterNom,
            prenom: filterPrenom,
            addresse: filterAddresse,
            telephone: filterTelephone,
            ramq: filterRamq,
            sortBy,
            sortDir,
        }),
        [
            filterNom,
            filterPrenom,
            filterAddresse,
            filterTelephone,
            filterRamq,
            sortBy,
            sortDir,
        ]
    );

    const filters = useDebounce(rawFilters, 300);
    const visibleErrorMessage = useMemo(() => {
        if (!error) {
            return null;
        }

        if (error.code === "ACCOUNT_TEMPORARILY_RESTRICTED") {
            return ui.restrictedAccess;
        }

        return error.message;
    }, [error, ui.restrictedAccess]);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [notesPatient, setNotesPatient] = useState<Patient | null>(null);
    const [form, setForm] = useState({
        nom: "",
        prenom: "",
        num_assurance_maladie: "",
        addresse: "",
        telephone: "",
        courriel: "",
        language: "fr" as PatientLanguage,
        lat: "",
        long: "",
        texto: false,
    });
    const [viewMode, setViewMode] = useState<"create" | "list">("list");
    useEffect(() => {
        loadPatients();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, page]);

    async function loadPatients() {
        setLoading(true);
        setError(null);

        const nomFilter = filters.nom || undefined;
        const prenomFilter = filters.prenom || undefined;
        const telFilter = filters.telephone || undefined;
        const addresseFilter = filters.addresse || undefined;

        const baseQuery = {
            page,
            limit,
            nom: nomFilter,
            prenom: prenomFilter,
            num_assurance_maladie: filters.ramq || undefined,
            addresse: addresseFilter,
            sortBy: filters.sortBy,
            sortDir: filters.sortDir,
        };

        const shouldUsePhoneOnly =
            !nomFilter && !prenomFilter && telFilter;

        const response = await fetchPatientsPaginated(
            shouldUsePhoneOnly
                ? { ...baseQuery, telephone: telFilter }
                : baseQuery
        );

        if ("error" in response) {
            setError(response.error);
            setLoading(false);
            return;
        }

        if (!response.data || !response.data.meta) {
            setError({
                code: "INTERNAL_ERROR",
                message: ui.invalidServerResponse,
                retryable: false,
            });
            setLoading(false);
            return;
        }

        let data = response.data.data;
        let totalPages = response.data.meta.totalPages;

        if (
            telFilter &&
            !shouldUsePhoneOnly &&
            response.data.meta.total > 1
        ) {
            const refined = await fetchPatientsPaginated({
                ...baseQuery,
                telephone: telFilter,
            });

            if ("error" in refined) {
                setError(refined.error);
                setLoading(false);
                return;
            }

            data = refined.data.data;
            totalPages = refined.data.meta.totalPages;
        }

        setPatients(data);
        setTotalPages(totalPages);
        setLoading(false);
    }

    function resetForm() {
        setEditingId(null);
        setForm({
            nom: "",
            prenom: "",
            num_assurance_maladie: "",
            addresse: "",
            telephone: "",
            courriel: "",
            language: "fr" as PatientLanguage,
            lat: "",
            long: "",
            texto: false,
        });
    }

    function toPayload(values: typeof form): PatientPayload {
        const payload: PatientPayload = {
            nom: values.nom.trim(),
            prenom: values.prenom.trim(),
            texto: values.texto,
            language: values.language,
        };

        if (values.num_assurance_maladie.trim()) {
            payload.num_assurance_maladie =
                values.num_assurance_maladie.trim();
        }
        if (values.addresse.trim()) {
            payload.addresse = values.addresse.trim();
        }
        if (values.telephone.trim()) {
            payload.telephone = values.telephone.trim();
        }
        if (values.courriel.trim()) {
            payload.courriel = values.courriel.trim();
        }
        if (values.lat.trim()) {
            const latValue = Number(values.lat.trim());
            if (!Number.isFinite(latValue)) {
                throw new Error(ui.invalidLatitude);
            }
            payload.lat = latValue;
        }
        if (values.long.trim()) {
            const longValue = Number(values.long.trim());
            if (!Number.isFinite(longValue)) {
                throw new Error(ui.invalidLongitude);
            }
            payload.long = longValue;
        }

        return payload;
    }

    async function handleSubmit() {
        if (formSaving) {
            return;
        }

        if (!form.nom.trim() || !form.prenom.trim()) {
            setError({
                code: "INVALID_INPUT",
                message: ui.requiredName,
                retryable: false,
            });
            setSaveFeedback({
                type: "error",
                message: ui.requiredName,
            });
            return;
        }

        setError(null);
        setLastWriteVerification(null);
        setSaveFeedback({
            type: "info",
            message: editingId ? ui.statusUpdating : ui.statusCreating,
        });
        setFormSaving(true);

        let savedMessage = editingId ? ui.statusUpdated : ui.statusCreated;
        let writeVerification: WriteVerificationMeta | null = null;

        if (editingId) {
            let payload: PatientPayload;
            try {
                payload = toPayload(form);
            } catch (err) {
                setError({
                    code: "INVALID_INPUT",
                    message:
                        err instanceof Error
                            ? err.message
                            : ui.invalidCoordinates,
                    retryable: false,
                });
                setSaveFeedback({
                    type: "error",
                    message:
                        err instanceof Error
                            ? err.message
                            : ui.invalidCoordinates,
                });
                setFormSaving(false);
                return;
            }
            const response = await updatePatient(editingId, payload);
            if ("error" in response) {
                setError(response.error);
                setSaveFeedback({
                    type: "error",
                    message: response.error.message || ui.statusFailed,
                });
                setFormSaving(false);
                return;
            }
            writeVerification = response.meta.writeVerification ?? null;
        } else {
            let payload: PatientPayload;
            try {
                payload = toPayload(form);
            } catch (err) {
                setError({
                    code: "INVALID_INPUT",
                    message:
                        err instanceof Error
                            ? err.message
                            : ui.invalidCoordinates,
                    retryable: false,
                });
                setSaveFeedback({
                    type: "error",
                    message:
                        err instanceof Error
                            ? err.message
                            : ui.invalidCoordinates,
                });
                setFormSaving(false);
                return;
            }
            const response = await createPatient(payload);
            if ("error" in response) {
                setError(response.error);
                setSaveFeedback({
                    type: "error",
                    message: response.error.message || ui.statusFailed,
                });
                setFormSaving(false);
                return;
            }
            writeVerification = response.meta.writeVerification ?? null;
        }

        resetForm();
        await loadPatients();
        setSaveFeedback({
            type: "success",
            message: formatWriteVerificationMessage(
                savedMessage,
                writeVerification
            ),
        });
        setLastWriteVerification(writeVerification);
        setFormSaving(false);
    }

    async function handleEdit(patient: Patient) {
        setEditingId(patient._id);
        setViewMode("create");
            setForm({
                nom: patient.nom ?? "",
                prenom: patient.prenom ?? "",
                num_assurance_maladie: patient.num_assurance_maladie ?? "",
                addresse: patient.addresse ?? "",
                telephone: patient.telephone ?? "",
                courriel: patient.courriel ?? "",
                language:
                    patient.language === "sp"
                        ? "es"
                        : patient.language ?? "fr",
                lat: patient.lat?.toString() ?? "",
                long: patient.long?.toString() ?? "",
                texto: Boolean(patient.texto),
            });
    }

    async function handleDelete(id: string) {
        const confirmed = window.confirm(
            ui.deleteConfirm
        );
        if (!confirmed) return;

        setBusyIds((p) => ({ ...p, [id]: true }));
        setError(null);
        setLastWriteVerification(null);
        setSaveFeedback({
            type: "info",
            message: ui.statusDeleting,
        });

        const response = await deletePatient(id);
        if ("error" in response) {
            setError(response.error);
            setSaveFeedback({
                type: "error",
                message: response.error.message || ui.statusFailed,
            });
            setBusyIds((p) => ({ ...p, [id]: false }));
            return;
        }

        setBusyIds((p) => ({ ...p, [id]: false }));
        await loadPatients();
        const writeVerification = response.meta.writeVerification ?? null;
        setSaveFeedback({
            type: "success",
            message: formatWriteVerificationMessage(
                ui.statusDeleted,
                writeVerification
            ),
        });
        setLastWriteVerification(writeVerification);
    }

    function toggleSort(
        field:
            | "nom"
            | "prenom"
            | "addresse"
            | "telephone"
            | "num_assurance_maladie"
    ) {
        setPage(1);
        setSortBy((current) => {
            if (current === field) {
                setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
                return current;
            }
            setSortDir("asc");
            return field;
        });
    }

    function sortLabel(
        field:
            | "nom"
            | "prenom"
            | "addresse"
            | "telephone"
            | "num_assurance_maladie"
    ) {
        if (sortBy !== field) return "";
        return sortDir === "asc" ? " ▲" : " ▼";
    }

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            <h1 className="text-2xl font-semibold">{ui.title}</h1>

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
                    {ui.createTab}
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
                    {ui.searchTab}
                </button>
            </div>

            {visibleErrorMessage && (
                <div className="text-sm text-red-600">
                    {visibleErrorMessage}
                </div>
            )}

            {saveFeedback && (
                <div>
                    <SaveFeedback
                        type={saveFeedback.type}
                        message={saveFeedback.message}
                    />
                    <WriteVerificationReceipt
                        verification={lastWriteVerification}
                        labels={labels.writeVerification}
                    />
                </div>
            )}

            {viewMode === "create" && (
                <div className="grid grid-cols-1 gap-4 bg-gray-50 border rounded p-4">
                    <div className="text-sm font-medium">
                        {editingId
                            ? ui.editTitle
                            : ui.createTitle}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                            className="border rounded p-2"
                            placeholder={ui.firstNamePlaceholder}
                            value={form.prenom}
                            onChange={(e) =>
                                setForm((p) => ({
                                    ...p,
                                    prenom: e.target.value,
                                }))
                            }
                        />
                        <label className="flex flex-col gap-1 text-sm">
                            <span>{ui.languageLabel}</span>
                            <select
                                className="border rounded p-2"
                                value={form.language}
                                onChange={(e) =>
                                    setForm((p) => ({
                                        ...p,
                                        language: e.target.value as PatientLanguage,
                                    }))
                                }
                            >
                                <option value="fr">{ui.languageOptions.frenchCanada}</option>
                                <option value="en">{ui.languageOptions.englishCanada}</option>
                                <option value="es">{ui.languageOptions.spanish}</option>
                                <option value="ko">{ui.languageOptions.korean}</option>
                                <option value="vi">{ui.languageOptions.vietnamese}</option>
                                <option value="no">{ui.languageOptions.norwegian}</option>
                                <option value="ja">{ui.languageOptions.japanese}</option>
                                <option value="zh">{ui.languageOptions.chinese}</option>
                                <option value="he">{ui.languageOptions.hebrew}</option>
                            </select>
                        </label>
                        <input
                            className="border rounded p-2"
                            placeholder={ui.lastNamePlaceholder}
                            value={form.nom}
                            onChange={(e) =>
                                setForm((p) => ({
                                    ...p,
                                    nom: e.target.value,
                                }))
                            }
                        />
                        <input
                            className="border rounded p-2"
                            placeholder={ui.ramqPlaceholder}
                            value={form.num_assurance_maladie}
                            onChange={(e) =>
                                setForm((p) => ({
                                    ...p,
                                    num_assurance_maladie: e.target.value,
                                }))
                            }
                        />
                        <input
                            className="border rounded p-2"
                            placeholder={ui.phonePlaceholder}
                            value={form.telephone}
                            onChange={(e) =>
                                setForm((p) => ({
                                    ...p,
                                    telephone: e.target.value,
                                }))
                            }
                        />
                        <input
                            className="border rounded p-2"
                            placeholder={ui.emailPlaceholder}
                            value={form.courriel}
                            onChange={(e) =>
                                setForm((p) => ({
                                    ...p,
                                    courriel: e.target.value,
                                }))
                            }
                        />
                        <input
                            className="border rounded p-2"
                            placeholder={ui.addressPlaceholder}
                            value={form.addresse}
                            autoComplete="off"
                            onChange={(e) =>
                                setForm((p) => ({
                                    ...p,
                                    addresse: e.target.value,
                                }))
                            }
                        />
                        <input
                            className="border rounded p-2"
                            placeholder={ui.latitudePlaceholder}
                            value={form.lat}
                            onChange={(e) =>
                                setForm((p) => ({
                                    ...p,
                                    lat: e.target.value,
                                }))
                            }
                        />
                        <input
                            className="border rounded p-2"
                            placeholder={ui.longitudePlaceholder}
                            value={form.long}
                            onChange={(e) =>
                                setForm((p) => ({
                                    ...p,
                                    long: e.target.value,
                                }))
                            }
                        />
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={form.texto}
                            onChange={(e) =>
                                setForm((p) => ({
                                    ...p,
                                    texto: e.target.checked,
                                }))
                            }
                        />
                        {ui.smsEnabled}
                    </label>

                    <div className="flex gap-2">
                        <button
                            onClick={handleSubmit}
                            disabled={formSaving}
                            className="px-4 py-2 bg-primary text-white rounded disabled:opacity-50"
                        >
                            {formSaving
                                ? editingId
                                    ? ui.saving
                                    : ui.creating
                                : editingId
                                    ? ui.save
                                    : ui.create}
                        </button>
                        {editingId && (
                            <button
                                onClick={resetForm}
                                disabled={formSaving}
                                className="px-4 py-2 border rounded"
                            >
                                {ui.cancel}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {viewMode === "list" && (
                <>
                    <div className="border rounded p-4 space-y-3">
                        <div className="text-sm font-medium">
                            {ui.searchTitle}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                            <input
                                className="border rounded p-2"
                                placeholder={ui.filterLastNamePlaceholder}
                                value={filterNom}
                                onChange={(e) => {
                                    setPage(1);
                                    setFilterNom(e.target.value);
                                }}
                            />
                            <input
                                className="border rounded p-2"
                                placeholder={ui.filterFirstNamePlaceholder}
                                value={filterPrenom}
                                onChange={(e) => {
                                    setPage(1);
                                    setFilterPrenom(e.target.value);
                                }}
                            />
                            <input
                                className="border rounded p-2"
                                placeholder={ui.filterAddressPlaceholder}
                                value={filterAddresse}
                                onChange={(e) => {
                                    setPage(1);
                                    setFilterAddresse(e.target.value);
                                }}
                            />
                            <input
                                className="border rounded p-2"
                                placeholder={ui.filterPhonePlaceholder}
                                value={filterTelephone}
                                onChange={(e) => {
                                    setPage(1);
                                    setFilterTelephone(e.target.value);
                                }}
                            />
                            <input
                                className="border rounded p-2"
                                placeholder={ui.filterRamqPlaceholder}
                                value={filterRamq}
                                onChange={(e) => {
                                    setPage(1);
                                    setFilterRamq(e.target.value);
                                }}
                            />
                        </div>
                    </div>

                    <div className="border rounded overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-100 text-gray-700">
                                <tr>
                                    <th className="text-left p-2">
                                        <button
                                            type="button"
                                            className="hover:underline"
                                            onClick={() => toggleSort("nom")}
                                        >
                                            {ui.tableLastName}{sortLabel("nom")}
                                        </button>
                                    </th>
                                    <th className="text-left p-2">
                                        <button
                                            type="button"
                                            className="hover:underline"
                                            onClick={() =>
                                                toggleSort("prenom")
                                            }
                                        >
                                            {ui.tableFirstName}{sortLabel("prenom")}
                                        </button>
                                    </th>
                                    <th className="text-left p-2">
                                        <button
                                            type="button"
                                            className="hover:underline"
                                            onClick={() =>
                                                toggleSort("addresse")
                                            }
                                        >
                                            {ui.tableAddress}{sortLabel("addresse")}
                                        </button>
                                    </th>
                                    <th className="text-left p-2">
                                        <button
                                            type="button"
                                            className="hover:underline"
                                            onClick={() =>
                                                toggleSort("telephone")
                                            }
                                        >
                                            {ui.tablePhone}{sortLabel("telephone")}
                                        </button>
                                    </th>
                                    <th className="text-left p-2">
                                        <button
                                            type="button"
                                            className="hover:underline"
                                            onClick={() =>
                                                toggleSort(
                                                    "num_assurance_maladie"
                                                )
                                            }
                                        >
                                            {ui.tableRamq}
                                            {sortLabel(
                                                "num_assurance_maladie"
                                            )}
                                        </button>
                                    </th>
                                    <th className="text-left p-2">{ui.tableActions}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && (
                                    <tr>
                                        <td
                                            className="p-2 text-gray-500"
                                            colSpan={5}
                                        >
                                            {ui.tableLoading}
                                        </td>
                                    </tr>
                                )}
                                {!loading && patients.length === 0 && (
                                    <tr>
                                        <td
                                            className="p-2 text-gray-500"
                                            colSpan={5}
                                        >
                                            {ui.empty}
                                        </td>
                                    </tr>
                                )}
                                {!loading &&
                                    patients.map((p) => (
                                        <tr
                                            key={p._id}
                                            className="border-t"
                                        >
                                            <td className="p-2">
                                                {p.nom}
                                            </td>
                                            <td className="p-2">
                                                {p.prenom}
                                            </td>
                                            <td className="p-2">
                                                {p.addresse || "—"}
                                            </td>
                                            <td className="p-2">
                                                {p.telephone || "—"}
                                            </td>
                                            <td className="p-2">
                                                {p.num_assurance_maladie}
                                            </td>
                                            <td className="p-2 flex gap-2">
                                                <Link
                                                    className="px-2 py-1 border rounded"
                                                    to={`/appointments?ramq=${encodeURIComponent(
                                                        p.num_assurance_maladie
                                                    )}`}
                                                >
                                                    {ui.createAppointment}
                                                </Link>
                                                <button
                                                    className="px-2 py-1 border rounded"
                                                    onClick={() =>
                                                        handleEdit(p)
                                                    }
                                                >
                                                    {ui.edit}
                                                </button>
                                                <button
                                                    className="px-2 py-1 border rounded"
                                                    onClick={() => setNotesPatient(p)}
                                                >
                                                    {labels.patientClinicalNotes.open}
                                                </button>
                                                <button
                                                    className="px-2 py-1 border rounded text-red-600"
                                                    disabled={
                                                        busyIds[p._id]
                                                    }
                                                    onClick={() =>
                                                        handleDelete(p._id)
                                                    }
                                                >
                                                    {ui.deleteLabel}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                    <PatientClinicalNotesModal
                        patient={notesPatient}
                        onClose={() => setNotesPatient(null)}
                        onSaved={(updatedPatient) => {
                            setPatients((previous) => previous.map((patient) =>
                                patient._id === updatedPatient._id ? updatedPatient : patient
                            ));
                            setNotesPatient(updatedPatient);
                        }}
                    />

                    <div className="flex items-center gap-3">
                        <button
                            className="px-3 py-1 border rounded"
                            disabled={page <= 1}
                            onClick={() =>
                                setPage((p) => Math.max(p - 1, 1))
                            }
                        >
                            {ui.previous}
                        </button>
                        <span className="text-sm text-gray-600">
                            {ui.pagePrefix} {page} {ui.pageSeparator} {totalPages}
                        </span>
                        <button
                            className="px-3 py-1 border rounded"
                            disabled={page >= totalPages}
                            onClick={() =>
                                setPage((p) =>
                                    Math.min(p + 1, totalPages)
                                )
                            }
                        >
                            {ui.next}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
