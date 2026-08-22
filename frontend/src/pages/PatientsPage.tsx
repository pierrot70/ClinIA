import { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { labels } from "../i18n/uiLabels";
import { useTranslation } from "../hooks/useTranslation";
import {
    createPatient,
    archivePatient,
    restorePatient,
    fetchPatientById,
    fetchPatientsPaginated,
    updatePatient,
    type Patient,
    type PatientCountry,
    type HealthInsuranceJurisdiction,
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
import { useAuth } from "../hooks/useAuth";
import {
    createPhysicianClinicalSupportRequest,
    listPhysicianClinicalSupportRequestStatuses,
} from "../services/clinicalSupportAccessApi";

function usePatientsPageLabels(targetLang: string) {
    const source = labels.patientsPage;
    const options = { targetLang, namespace: "patients-page" };

    const { translated: title } = useTranslation({ text: source.title, ...options });
    const { translated: createTab } = useTranslation({ text: source.tabs.create, ...options });
    const { translated: searchTab } = useTranslation({ text: source.tabs.search, ...options });
    const { translated: archivedTab } = useTranslation({ text: source.tabs.archived, ...options });
    const { translated: invalidServerResponse } = useTranslation({ text: source.validation.invalidServerResponse, ...options });
    const { translated: invalidLatitude } = useTranslation({ text: source.validation.invalidLatitude, ...options });
    const { translated: invalidLongitude } = useTranslation({ text: source.validation.invalidLongitude, ...options });
    const { translated: requiredName } = useTranslation({ text: source.validation.requiredName, ...options });
    const { translated: invalidCoordinates } = useTranslation({ text: source.validation.invalidCoordinates, ...options });
    const { translated: potentialDuplicateConfirm } = useTranslation({ text: source.validation.potentialDuplicateConfirm, ...options });
    const { translated: archiveConfirm } = useTranslation({ text: source.validation.archiveConfirm, ...options });
    const { translated: archiveReasonPrompt } = useTranslation({ text: source.validation.archiveReasonPrompt, ...options });
    const { translated: archiveReasonRequired } = useTranslation({ text: source.validation.archiveReasonRequired, ...options });
    const { translated: restoreConfirm } = useTranslation({ text: source.validation.restoreConfirm, ...options });
    const { translated: restoreReasonPrompt } = useTranslation({ text: source.validation.restoreReasonPrompt, ...options });
    const { translated: restoreReasonRequired } = useTranslation({ text: source.validation.restoreReasonRequired, ...options });
    const { translated: restrictedAccess } = useTranslation({ text: source.validation.restrictedAccess, ...options });
    const { translated: editTitle } = useTranslation({ text: source.form.editTitle, ...options });
    const { translated: createTitle } = useTranslation({ text: source.form.createTitle, ...options });
    const { translated: firstNamePlaceholder } = useTranslation({ text: source.form.firstNamePlaceholder, ...options });
    const { translated: lastNamePlaceholder } = useTranslation({ text: source.form.lastNamePlaceholder, ...options });
    const { translated: ramqPlaceholder } = useTranslation({ text: source.form.ramqPlaceholder, ...options });
    const { translated: countryLabel } = useTranslation({ text: source.form.countryLabel, ...options });
    const { translated: healthInsuranceJurisdictionLabel } = useTranslation({ text: source.form.healthInsuranceJurisdictionLabel, ...options });
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
    const { translated: statusArchiving } = useTranslation({ text: source.status.archiving, ...options });
    const { translated: statusRestoring } = useTranslation({ text: source.status.restoring, ...options });
    const { translated: statusCreated } = useTranslation({ text: source.status.created, ...options });
    const { translated: statusUpdated } = useTranslation({ text: source.status.updated, ...options });
    const { translated: statusArchived } = useTranslation({ text: source.status.archived, ...options });
    const { translated: statusRestored } = useTranslation({ text: source.status.restored, ...options });
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
    const { translated: archiveLabel } = useTranslation({ text: source.table.archive, ...options });
    const { translated: restoreLabel } = useTranslation({ text: source.table.restore, ...options });
    const { translated: archivedLabel } = useTranslation({ text: source.table.archived, ...options });
    const { translated: archivedAt } = useTranslation({ text: source.table.archivedAt, ...options });
    const { translated: requestSupport } = useTranslation({ text: source.table.requestSupport, ...options });
    const { translated: supportRequestPending } = useTranslation({ text: source.table.supportRequestPending, ...options });
    const { translated: supportRequested } = useTranslation({ text: source.table.supportRequested, ...options });
    const { translated: supportRequestFailed } = useTranslation({ text: source.table.supportRequestFailed, ...options });
    const { translated: clinicalNotesOpen } = useTranslation({ text: labels.patientClinicalNotes.open, ...options });
    const { translated: previous } = useTranslation({ text: source.pagination.previous, ...options });
    const { translated: next } = useTranslation({ text: source.pagination.next, ...options });
    const { translated: pagePrefix } = useTranslation({ text: source.pagination.pagePrefix, ...options });
    const { translated: pageSeparator } = useTranslation({ text: source.pagination.pageSeparator, ...options });
    const { translated: resultsPerPage } = useTranslation({ text: source.pagination.resultsPerPage, ...options });
    const { translated: expandCard } = useTranslation({ text: source.cards.expand, ...options });
    const { translated: collapseCard } = useTranslation({ text: source.cards.collapse, ...options });

    return {
        title,
        createTab,
        searchTab,
        archivedTab,
        invalidServerResponse,
        invalidLatitude,
        invalidLongitude,
        requiredName,
        invalidCoordinates,
        potentialDuplicateConfirm,
        archiveConfirm,
        archiveReasonPrompt,
        archiveReasonRequired,
        restoreConfirm,
        restoreReasonPrompt,
        restoreReasonRequired,
        restrictedAccess,
        editTitle,
        createTitle,
        firstNamePlaceholder,
        lastNamePlaceholder,
        ramqPlaceholder,
        countryLabel,
        countryOptions: source.form.countryOptions,
        healthInsuranceJurisdictionLabel,
        healthInsuranceJurisdictionOptions: source.form.healthInsuranceJurisdictionOptions,
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
        statusArchiving,
        statusRestoring,
        statusCreated,
        statusUpdated,
        statusArchived,
        statusRestored,
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
        archiveLabel,
        restoreLabel,
        archivedLabel,
        archivedAt,
        requestSupport,
        supportRequestPending,
        supportRequested,
        supportRequestFailed,
        clinicalNotesOpen,
        previous,
        next,
        pagePrefix,
        pageSeparator,
        resultsPerPage,
        expandCard,
        collapseCard,
    };
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function PatientsPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const i18n = useContext(HomeI18nContext) || { locale: "fr" };
    const targetLang = i18n.locale;
    const ui = usePatientsPageLabels(targetLang);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [supportRequestPatientIds, setSupportRequestPatientIds] = useState<Set<string>>(() => new Set());
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
    const [limit, setLimit] = useState(() => window.innerWidth < 768 ? 3 : 10);
    const [totalPages, setTotalPages] = useState(1);

    useEffect(() => {
        const mobileQuery = window.matchMedia("(max-width: 767px)");

        const normalizePageLimit = () => {
            setLimit((currentLimit) => {
                const nextLimit = mobileQuery.matches
                    ? (currentLimit === 2 ? 2 : 3)
                    : ([2, 5, 10, 15, 25, 100].includes(currentLimit)
                        ? currentLimit
                        : 10);

                if (nextLimit !== currentLimit) {
                    setPage(1);
                }

                return nextLimit;
            });
        };

        normalizePageLimit();
        mobileQuery.addEventListener("change", normalizePageLimit);
        return () => mobileQuery.removeEventListener("change", normalizePageLimit);
    }, []);

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
    const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null);
    const [form, setForm] = useState({
        nom: "",
        prenom: "",
        num_assurance_maladie: "",
        country: "CA" as PatientCountry,
        healthInsuranceJurisdiction: "UNKNOWN" as HealthInsuranceJurisdiction,
        addresse: "",
        telephone: "",
        courriel: "",
        language: "fr" as PatientLanguage,
        lat: "",
        long: "",
        texto: false,
    });
    const [viewMode, setViewMode] = useState<"create" | "list" | "archived">("list");
    useEffect(() => {
        loadPatients();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, limit, page, viewMode]);

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
            archiveStatus:
                viewMode === "archived" ? ("archived" as const) : ("active" as const),
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

        if (user?.role === "MEDECIN") {
            const supportStatuses = await listPhysicianClinicalSupportRequestStatuses();
            if (!("error" in supportStatuses)) {
                setSupportRequestPatientIds(new Set(supportStatuses.data.map((request) => request.patientId)));
            }
        } else {
            setSupportRequestPatientIds(new Set());
        }

        setLoading(false);
    }

    function resetForm() {
        setEditingId(null);
        setForm({
            nom: "",
            prenom: "",
            num_assurance_maladie: "",
            country: "CA" as PatientCountry,
            healthInsuranceJurisdiction: "UNKNOWN" as HealthInsuranceJurisdiction,
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
            country: values.country,
            healthInsuranceJurisdiction: values.healthInsuranceJurisdiction,
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
            if (!Number.isFinite(latValue) || latValue < -90 || latValue > 90) {
                throw new Error(ui.invalidLatitude);
            }
            payload.lat = latValue;
        }
        if (values.long.trim()) {
            const longValue = Number(values.long.trim());
            if (!Number.isFinite(longValue) || longValue < -180 || longValue > 180) {
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
            let response = await createPatient(payload);
            if (
                "error" in response &&
                response.error.code === "POTENTIAL_DUPLICATE" &&
                window.confirm(ui.potentialDuplicateConfirm)
            ) {
                response = await createPatient(payload, {
                    confirmPotentialDuplicate: true,
                });
            }
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
        const response = await fetchPatientById(patient._id);
        if ("error" in response) {
            setError(response.error);
            return;
        }

        const detail = response.data;
        setEditingId(patient._id);
        setViewMode("create");
            setForm({
                nom: detail.nom ?? "",
                prenom: detail.prenom ?? "",
                num_assurance_maladie: detail.num_assurance_maladie ?? "",
                country: detail.country ?? "CA",
                healthInsuranceJurisdiction:
                    detail.healthInsuranceJurisdiction ?? "UNKNOWN",
                addresse: detail.addresse ?? "",
                telephone: detail.telephone ?? "",
                courriel: detail.courriel ?? "",
                language:
                    detail.language === "sp"
                        ? "es"
                        : detail.language ?? "fr",
                lat: detail.lat?.toString() ?? "",
                long: detail.long?.toString() ?? "",
                texto: Boolean(detail.texto),
            });
    }

    async function handleOpenClinicalNotes(patientId: string) {
        const response = await fetchPatientById(patientId);
        if ("error" in response) {
            setError(response.error);
            return;
        }

        setNotesPatient(response.data);
    }

    async function handleRequestSupport(patient: Patient) {
        const response = await createPhysicianClinicalSupportRequest({ patientId: patient._id, reasonCode: "TECHNICAL_SUPPORT" });
        if ("error" in response) {
            setSaveFeedback({ type: "error", message: response.error.message || ui.supportRequestFailed });
            return;
        }
        setSaveFeedback({ type: "success", message: ui.supportRequested });
        setSupportRequestPatientIds((current) => new Set(current).add(patient._id));
    }

    async function handleArchive(id: string) {
        const confirmed = window.confirm(
            ui.archiveConfirm
        );
        if (!confirmed) return;

        const reason = window.prompt(ui.archiveReasonPrompt)?.trim();
        if (!reason) {
            setSaveFeedback({
                type: "error",
                message: ui.archiveReasonRequired,
            });
            return;
        }

        setBusyIds((p) => ({ ...p, [id]: true }));
        setError(null);
        setLastWriteVerification(null);
        setSaveFeedback({
            type: "info",
            message: ui.statusArchiving,
        });

        const response = await archivePatient(id, reason);
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
                ui.statusArchived,
                writeVerification
            ),
        });
        setLastWriteVerification(writeVerification);
    }

    async function handleRestore(id: string) {
        if (!window.confirm(ui.restoreConfirm)) return;

        const reason = window.prompt(ui.restoreReasonPrompt)?.trim();
        if (!reason) {
            setSaveFeedback({
                type: "error",
                message: ui.restoreReasonRequired,
            });
            return;
        }

        setBusyIds((p) => ({ ...p, [id]: true }));
        setError(null);
        setLastWriteVerification(null);
        setSaveFeedback({ type: "info", message: ui.statusRestoring });

        const response = await restorePatient(id, reason);
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
                ui.statusRestored,
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
        <div className="max-w-6xl mx-auto space-y-6 p-6 pb-28 md:pb-6">
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
                <button
                    type="button"
                    className={`px-4 py-2 rounded border font-semibold transition ${
                        viewMode === "archived"
                            ? "bg-primary text-white border-primary"
                            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                    onClick={() => {
                        setPage(1);
                        setViewMode("archived");
                    }}
                >
                    {ui.archivedTab}
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
                            <span>{ui.countryLabel}</span>
                            <select
                                className="border rounded p-2"
                                value={form.country}
                                onChange={(e) =>
                                    setForm((p) => ({
                                        ...p,
                                        country: e.target.value as PatientCountry,
                                    }))
                                }
                            >
                                <option value="CA">{ui.countryOptions.CA}</option>
                            </select>
                        </label>
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
                        <label className="flex flex-col gap-1 text-sm">
                            <span>{ui.healthInsuranceJurisdictionLabel}</span>
                            <select
                                className="border rounded p-2"
                                value={form.healthInsuranceJurisdiction}
                                onChange={(e) =>
                                    setForm((p) => ({
                                        ...p,
                                        healthInsuranceJurisdiction:
                                            e.target.value as HealthInsuranceJurisdiction,
                                    }))
                                }
                            >
                                {Object.entries(ui.healthInsuranceJurisdictionOptions).map(
                                    ([code, label]) => (
                                        <option key={code} value={code}>{label}</option>
                                    )
                                )}
                            </select>
                        </label>
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
                            type="number"
                            min={-90}
                            max={90}
                            step="any"
                            inputMode="decimal"
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
                            type="number"
                            min={-180}
                            max={180}
                            step="any"
                            inputMode="decimal"
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

            {(viewMode === "list" || viewMode === "archived") && (
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

                    <div className="space-y-3 md:hidden">
                        {loading && <p className="rounded border bg-white p-4 text-sm text-gray-500">{ui.tableLoading}</p>}
                        {!loading && patients.length === 0 && <p className="rounded border bg-white p-4 text-sm text-gray-500">{ui.empty}</p>}
                        {!loading && patients.map((p) => (
                            <article key={p._id} className="rounded border bg-white p-3 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <h2 className="font-semibold text-gray-900">{p.prenom} {p.nom}</h2>
                                    {viewMode === "archived" && <span className="text-xs text-amber-800">{ui.archivedLabel}</span>}
                                </div>
                                <button type="button" className="mt-3 flex w-full items-center justify-between rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800" aria-expanded={expandedPatientId === p._id} onClick={() => setExpandedPatientId((current) => current === p._id ? null : p._id)}>
                                    <span>{expandedPatientId === p._id ? ui.collapseCard : ui.expandCard}</span><span aria-hidden="true">{expandedPatientId === p._id ? "⌃" : "⌄"}</span>
                                </button>
                                {expandedPatientId === p._id && <>
                                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
                                    <div><dt>{ui.tableAddress}</dt><dd className="text-gray-900">{p.addresse || "—"}</dd></div>
                                    <div><dt>{ui.tablePhone}</dt><dd className="text-gray-900">{p.telephone || "—"}</dd></div>
                                </dl>
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                    {viewMode === "archived" ? (
                                        <button className="col-span-2 min-h-11 rounded border border-emerald-600 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 shadow-sm" disabled={busyIds[p._id]} onClick={() => handleRestore(p._id)}>{ui.restoreLabel}</button>
                                    ) : (<>
                                        <button type="button" className="col-span-2 min-h-11 rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700" onClick={() => navigate("/appointments", { state: { patientId: p._id } })}>{ui.createAppointment}</button>
                                        <button className="min-h-11 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50" onClick={() => handleEdit(p)}>{ui.edit}</button>
                                        <button className="min-h-11 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50" onClick={() => handleOpenClinicalNotes(p._id)}>{ui.clinicalNotesOpen}</button>
                                        {user?.role === "MEDECIN" && <button type="button" className="col-span-2 min-h-11 rounded border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 shadow-sm disabled:opacity-60" disabled={supportRequestPatientIds.has(p._id)} onClick={() => void handleRequestSupport(p)}>{supportRequestPatientIds.has(p._id) ? ui.supportRequestPending : ui.requestSupport}</button>}
                                        <button className="col-span-2 min-h-11 rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 shadow-sm" disabled={busyIds[p._id]} onClick={() => handleArchive(p._id)}>{ui.archiveLabel}</button>
                                    </>)}
                                </div>
                                </>}
                            </article>
                        ))}
                    </div>

                    <div className="hidden overflow-hidden rounded border md:block">
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
                                                {viewMode === "archived" ? (
                                                    <>
                                                        <span className="text-sm text-amber-800">
                                                            {ui.archivedLabel}
                                                            {p.archivedAt
                                                                ? ` - ${ui.archivedAt} ${new Date(p.archivedAt).toLocaleString()}`
                                                                : ""}
                                                        </span>
                                                        <button
                                                            className="px-2 py-1 border rounded text-emerald-700"
                                                            disabled={busyIds[p._id]}
                                                            onClick={() => handleRestore(p._id)}
                                                        >
                                                            {ui.restoreLabel}
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                <button
                                                    type="button"
                                                    className="px-2 py-1 border rounded"
                                                    onClick={() =>
                                                        navigate("/appointments", {
                                                            state: { patientId: p._id },
                                                        })
                                                    }
                                                >
                                                    {ui.createAppointment}
                                                </button>
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
                                                    onClick={() =>
                                                        handleOpenClinicalNotes(p._id)
                                                    }
                                                >
                                                    {ui.clinicalNotesOpen}
                                                </button>
                                                {user?.role === "MEDECIN" && (
                                                    <button
                                                        type="button"
                                                        className="px-2 py-1 border rounded text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                                                        disabled={supportRequestPatientIds.has(p._id)}
                                                        onClick={() => void handleRequestSupport(p)}
                                                    >
                                                        {supportRequestPatientIds.has(p._id)
                                                            ? ui.supportRequestPending
                                                            : ui.requestSupport}
                                                    </button>
                                                )}
                                                <button
                                                    className="px-2 py-1 border rounded text-amber-700"
                                                    disabled={
                                                        busyIds[p._id]
                                                    }
                                                    onClick={() =>
                                                        handleArchive(p._id)
                                                    }
                                                >
                                                    {ui.archiveLabel}
                                                </button>
                                                    </>
                                                )}
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

                    <div className="fixed inset-x-0 bottom-0 z-30 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(15,23,42,0.12)] md:static md:z-auto md:border-0 md:bg-transparent md:p-0 md:shadow-none">
                        <button
                            className="rounded border px-3 py-1 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
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
                            className="rounded border px-3 py-1 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                            disabled={page >= totalPages}
                            onClick={() =>
                                setPage((p) =>
                                    Math.min(p + 1, totalPages)
                                )
                            }
                        >
                            {ui.next}
                        </button>
                        <label className="flex items-center gap-2 text-sm text-gray-600 md:hidden">
                            {ui.resultsPerPage}
                            <select className="rounded border px-2 py-1" value={limit} onChange={(event) => { setPage(1); setLimit(Number(event.target.value)); }}>
                                {[2, 3].map((value) => <option key={value} value={value}>{value}</option>)}
                            </select>
                        </label>
                        <label className="hidden items-center gap-2 text-sm text-gray-600 md:flex">
                            {ui.resultsPerPage}
                            <select className="rounded border px-2 py-1" value={limit} onChange={(event) => { setPage(1); setLimit(Number(event.target.value)); }}>
                                {[2, 5, 10, 15, 25, 100].map((value) => <option key={value} value={value}>{value}</option>)}
                            </select>
                        </label>
                    </div>
                </>
            )}
        </div>
    );
}
