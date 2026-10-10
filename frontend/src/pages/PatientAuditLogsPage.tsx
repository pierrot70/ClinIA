import { UiMessage } from "../components/i18n/UiMessage";
import { labels } from "../i18n/uiLabels";
import { useUiLabels } from "../hooks/useUiLabels";
import { translateUiLabelTree } from "../i18n/pageUiLabels";
import { useEffect, useMemo, useState } from "react";
import {
    fetchPatientsPaginated,
    fetchPatientAuditLogs,
    type Patient,
    type PatientAuditLog,
} from "../services/patientsApi";
import type { ApiError } from "../types/api";
import { useDebounce } from "../hooks/useDebounce";

const ACTION_OPTIONS = [
    { value: "", label: labels.pageUi.toutesLesActions },
    { value: "PATIENT_CREATE", label: labels.pageUi.creation },
    { value: "PATIENT_UPDATE", label: labels.pageUi.modification },
    { value: "PATIENT_ARCHIVE", label: labels.pageUi.archive },
    { value: "PATIENT_DELETE", label: labels.pageUi.deletion },
] as const;

function formatTimestamp(value: string, locale: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString(locale);
}

function formatAction(action: PatientAuditLog["action"]) {
    if (action === "PATIENT_CREATE") return labels.pageUi.creation;
    if (action === "PATIENT_UPDATE") return labels.pageUi.modification;
    if (action === "PATIENT_ARCHIVE") return labels.pageUi.archive;
    if (action === "PATIENT_DELETE") return labels.pageUi.deletion;
    return action;
}

function formatAuditContext(log: PatientAuditLog, t: (source: string) => string) {
    const secureRequest = log.context?.secureRequest;

    if (!secureRequest) {
        return "-";
    }

    const parts = [];

    if (secureRequest.clinicalScopeProvided) {
        parts.push(t(labels.pageUi.porteeCliniqueEnregistree));
    }

    if (secureRequest.objectiveProvided) {
        parts.push(t(labels.pageUi.objectifEnregistre));
    }

    if ((secureRequest.selectedDocumentCount || 0) > 0) {
        parts.push(t(labels.pageUi.documentsSelected).replace("{count}", String(secureRequest.selectedDocumentCount)));
    }

    return parts.length > 0 ? parts.join(" | ") : "-";
}

export function PatientAuditLogsPage() {
    const { locale: uiLocale, t } = useUiLabels();
    const [logs, setLogs] = useState<PatientAuditLog[]>([]);
    const [patientOptions, setPatientOptions] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(false);
    const [patientsLoading, setPatientsLoading] = useState(false);
    const [error, setError] = useState<ApiError | null>(null);

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const limit = 20;

    const [action, setAction] = useState<
        | ""
        | "PATIENT_CREATE"
        | "PATIENT_UPDATE"
        | "PATIENT_ARCHIVE"
        | "PATIENT_DELETE"
    >("");
    const [patientSearch, setPatientSearch] = useState("");
    const [patientId, setPatientId] = useState("");
    const [actorUserId, setActorUserId] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const debouncedPatientSearch = useDebounce(patientSearch, 300);

    const rawFilters = useMemo(
        () => ({
            action,
            patientId,
            actorUserId,
            startDate,
            endDate,
        }),
        [action, patientId, actorUserId, startDate, endDate]
    );

    const filters = useDebounce(rawFilters, 300);

    useEffect(() => {
        void loadAuditLogs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, page]);

    useEffect(() => {
        void loadPatients();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedPatientSearch]);

    async function loadAuditLogs() {
        setLoading(true);
        setError(null);

        const response = await fetchPatientAuditLogs({
            page,
            limit,
            action: filters.action,
            patientId: filters.patientId.trim() || undefined,
            actorUserId: filters.actorUserId.trim() || undefined,
            startDate: filters.startDate || undefined,
            endDate: filters.endDate || undefined,
        });

        if ("error" in response) {
            setError(response.error);
            setLogs([]);
            setLoading(false);
            return;
        }

        setLogs(response.data.logs);
        setPage(response.data.pagination.page);
        setTotalPages(response.data.pagination.totalPages);
        setTotal(response.data.pagination.total);
        setLoading(false);
    }

    async function loadPatients() {
        setPatientsLoading(true);

        const search = debouncedPatientSearch.trim();
        let response = await fetchPatientsPaginated({
            page: 1,
            limit: 50,
            sortBy: "nom",
            sortDir: "asc",
            ...(search ? { nom: search } : {}),
        });

        if (
            !("error" in response) &&
            search &&
            response.data.data.length === 0
        ) {
            response = await fetchPatientsPaginated({
                page: 1,
                limit: 50,
                sortBy: "nom",
                sortDir: "asc",
                prenom: search,
            });
        }

        if ("error" in response) {
            setPatientOptions([]);
            setPatientsLoading(false);
            return;
        }

        setPatientOptions(response.data.data);
        setPatientsLoading(false);
    }

    function resetFilters() {
        setAction("");
        setPatientSearch("");
        setPatientId("");
        setActorUserId("");
        setStartDate("");
        setEndDate("");
        setPage(1);
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
            <header className="space-y-2">
                <h1 className="text-2xl font-semibold text-gray-900">
                    {t(labels.pageUi.auditsPatient)}</h1>
                <p className="text-sm text-gray-600 max-w-3xl">
                    {t(labels.pageUi.consultezLesCreationsModificationsEtSuppressionsDePatientsAvecLActeurL)}</p>
            </header>

            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <label className="text-sm text-gray-700">
                        {t(labels.pageUi.action)}<select
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={action}
                            onChange={(event) => {
                                setPage(1);
                                setAction(
                                    event.target.value as
                                        | ""
                                        | "PATIENT_CREATE"
                                        | "PATIENT_UPDATE"
                                        | "PATIENT_ARCHIVE"
                                        | "PATIENT_DELETE"
                                );
                            }}
                        >
                            {ACTION_OPTIONS.map((option) => (
                                <option key={option.value || "all"} value={option.value}>
                                    {t(option.label)}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="text-sm text-gray-700">
                        {t(labels.pageUi.rechercherPatient)}<input
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={patientSearch}
                            onChange={(event) => {
                                setPage(1);
                                setPatientSearch(event.target.value);
                            }}
                            placeholder={t(labels.pageUi.exPierrot)}
                        />
                    </label>

                    <label className="text-sm text-gray-700">
                        {t(labels.pageUi.patient)}<select
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={patientId}
                            onChange={(event) => {
                                setPage(1);
                                setPatientId(event.target.value);
                            }}
                        >
                            <option value="">
                                {patientsLoading
                                    ? t(labels.pageUi.chargementDesPatients)
                                    : t(labels.pageUi.tousLesPatients)}
                            </option>
                            {patientOptions.map((patient) => (
                                <option key={patient._id} value={patient._id}>
                                    {patient.prenom} {patient.nom}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="text-sm text-gray-700">
                        {t(labels.pageUi.actorUserID)}<input
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={actorUserId}
                            onChange={(event) => {
                                setPage(1);
                                setActorUserId(event.target.value);
                            }}
                            placeholder="507f..."
                        />
                    </label>

                    <label className="text-sm text-gray-700">
                        {t(labels.pageUi.dateDebut)}<input
                            type="date"
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={startDate}
                            max={endDate || undefined}
                            onChange={(event) => {
                                setPage(1);
                                setStartDate(event.target.value);
                            }}
                        />
                    </label>

                    <label className="text-sm text-gray-700">
                        {t(labels.pageUi.dateFin)}<input
                            type="date"
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={endDate}
                            min={startDate || undefined}
                            onChange={(event) => {
                                setPage(1);
                                setEndDate(event.target.value);
                            }}
                        />
                    </label>
                </div>

                {patientId && (
                    <div className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                        {t(labels.pageUi.patientIDSelectionne)} {patientId}
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-3 text-sm">
                    <button
                        type="button"
                        onClick={() => {
                            void loadAuditLogs();
                        }}
                        className="rounded bg-gray-900 px-4 py-2 font-medium text-white hover:bg-gray-800"
                    >
                        {t(labels.pageUi.actualiser)}</button>
                    <button
                        type="button"
                        onClick={resetFilters}
                        className="rounded border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:border-gray-400"
                    >
                        {t(labels.pageUi.reinitialiser)}</button>
                    <span className="text-gray-500">
                        {loading ? t(labels.pageUi.loading) : t(labels.pageUi.auditCount).replace("{count}", total.toLocaleString(uiLocale))}
                    </span>
                </div>

                {error && (
                    <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        <UiMessage message={error.message} />
                    </div>
                )}
            </section>

            <section className="rounded-xl border border-gray-200 bg-white shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-600">
                            <tr>
                                <th className="px-4 py-3">{t(labels.pageUi.date)}</th>
                                <th className="px-4 py-3">{t(labels.pageUi.action)}</th>
                                <th className="px-4 py-3">{t(labels.pageUi.acteur)}</th>
                                <th className="px-4 py-3">{t(labels.pageUi.patient)}</th>
                                <th className="px-4 py-3">{t(labels.pageUi.iP)}</th>
                                <th className="px-4 py-3">{t(labels.pageUi.champs)}</th>
                                <th className="px-4 py-3">{t(labels.pageUi.contexte)}</th>
                                <th className="px-4 py-3">{t(labels.pageUi.route)}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr>
                                    <td className="px-4 py-6 text-gray-500" colSpan={8}>
                                        {t(labels.pageUi.chargementDesAuditsPatient)}</td>
                                </tr>
                            )}

                            {!loading && logs.length === 0 && (
                                <tr>
                                    <td className="px-4 py-6 text-gray-500" colSpan={8}>
                                        {t(labels.pageUi.aucunAuditPatientTrouve)}</td>
                                </tr>
                            )}

                            {!loading &&
                                logs.map((log) => (
                                    <tr key={log.id} className="border-t border-gray-100 align-top">
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                                            {formatTimestamp(log.timestamp, uiLocale)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 border border-sky-200">
                                                {t(formatAction(log.action))}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">
                                            <div>{log.actorUsernameMasked || t(labels.openAiLogs.status.unknownActor)}</div>
                                            <div className="text-xs text-gray-500">{log.actorRole || "-"}</div>
                                            <div className="text-xs text-gray-500 break-all">{log.actorUserId || "-"}</div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700 break-all">
                                            {log.patientId || "-"}
                                        </td>
                                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                                            {log.ip || "-"}
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">
                                            {log.changedFields.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {log.changedFields.map((field) => (
                                                        <span
                                                            key={`${log.id}-${field}`}
                                                            className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700"
                                                        >
                                                            {field}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">
                                            {formatAuditContext(log, t)}
                                        </td>
                                        <td className="px-4 py-3 text-gray-700 break-all">
                                            {log.requestPath || "-"}
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
                    <span>
                        {t(labels.pageUi.page)} {page} / {Math.max(1, totalPages)}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setPage((current) => Math.max(current - 1, 1))}
                            disabled={page <= 1 || loading}
                            className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-50"
                        >
                            {t(labels.pageUi.precedent2)}</button>
                        <button
                            type="button"
                            onClick={() =>
                                setPage((current) => Math.min(current + 1, Math.max(1, totalPages)))
                            }
                            disabled={page >= totalPages || loading}
                            className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-50"
                        >
                            {t(labels.pageUi.suivant2)}</button>
                    </div>
                </div>
            </section>
        </div>
    );
}
