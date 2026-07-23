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
    { value: "", label: "Toutes les actions" },
    { value: "PATIENT_CREATE", label: "Création" },
    { value: "PATIENT_UPDATE", label: "Modification" },
    { value: "PATIENT_ARCHIVE", label: "Archivage" },
    { value: "PATIENT_DELETE", label: "Suppression" },
] as const;

function formatTimestamp(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

function formatAction(action: PatientAuditLog["action"]) {
    if (action === "PATIENT_CREATE") return "Création";
    if (action === "PATIENT_UPDATE") return "Modification";
    if (action === "PATIENT_ARCHIVE") return "Archivage";
    if (action === "PATIENT_DELETE") return "Suppression";
    return action;
}

function formatAuditContext(log: PatientAuditLog) {
    const secureRequest = log.context?.secureRequest;

    if (!secureRequest) {
        return "-";
    }

    const parts = [];

    if (secureRequest.clinicalScopeProvided) {
        parts.push("Portee clinique enregistree");
    }

    if (secureRequest.objectiveProvided) {
        parts.push("Objectif enregistre");
    }

    if ((secureRequest.selectedDocumentCount || 0) > 0) {
        parts.push(`Documents: ${secureRequest.selectedDocumentCount}`);
    }

    return parts.length > 0 ? parts.join(" | ") : "-";
}

export function PatientAuditLogsPage() {
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
                    Audits patient
                </h1>
                <p className="text-sm text-gray-600 max-w-3xl">
                    Consultez les créations, modifications et suppressions de patients avec l’acteur,
                    l’IP, les champs touchés, le contexte de requête et l’horodatage.
                </p>
            </header>

            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <label className="text-sm text-gray-700">
                        Action
                        <select
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
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="text-sm text-gray-700">
                        Rechercher patient
                        <input
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={patientSearch}
                            onChange={(event) => {
                                setPage(1);
                                setPatientSearch(event.target.value);
                            }}
                            placeholder="Ex: Pierrot"
                        />
                    </label>

                    <label className="text-sm text-gray-700">
                        Patient
                        <select
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            value={patientId}
                            onChange={(event) => {
                                setPage(1);
                                setPatientId(event.target.value);
                            }}
                        >
                            <option value="">
                                {patientsLoading
                                    ? "Chargement des patients..."
                                    : "Tous les patients"}
                            </option>
                            {patientOptions.map((patient) => (
                                <option key={patient._id} value={patient._id}>
                                    {patient.prenom} {patient.nom}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="text-sm text-gray-700">
                        Actor User ID
                        <input
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
                        Date début
                        <input
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
                        Date fin
                        <input
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
                        Patient ID sélectionné: {patientId}
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
                        Actualiser
                    </button>
                    <button
                        type="button"
                        onClick={resetFilters}
                        className="rounded border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:border-gray-400"
                    >
                        Réinitialiser
                    </button>
                    <span className="text-gray-500">
                        {loading ? "Chargement..." : `${total} audit${total > 1 ? "s" : ""}`}
                    </span>
                </div>

                {error && (
                    <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error.message}
                    </div>
                )}
            </section>

            <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-600">
                            <tr>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3">Action</th>
                                <th className="px-4 py-3">Acteur</th>
                                <th className="px-4 py-3">Patient</th>
                                <th className="px-4 py-3">IP</th>
                                <th className="px-4 py-3">Champs</th>
                                <th className="px-4 py-3">Contexte</th>
                                <th className="px-4 py-3">Route</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr>
                                    <td className="px-4 py-6 text-gray-500" colSpan={8}>
                                        Chargement des audits patient...
                                    </td>
                                </tr>
                            )}

                            {!loading && logs.length === 0 && (
                                <tr>
                                    <td className="px-4 py-6 text-gray-500" colSpan={8}>
                                        Aucun audit patient trouvé.
                                    </td>
                                </tr>
                            )}

                            {!loading &&
                                logs.map((log) => (
                                    <tr key={log.id} className="border-t border-gray-100 align-top">
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                                            {formatTimestamp(log.timestamp)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 border border-sky-200">
                                                {formatAction(log.action)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">
                                            <div>{log.actorUsernameMasked || "unknown"}</div>
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
                                            {formatAuditContext(log)}
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
                        Page {page} / {Math.max(1, totalPages)}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setPage((current) => Math.max(current - 1, 1))}
                            disabled={page <= 1 || loading}
                            className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-50"
                        >
                            Précédent
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                setPage((current) => Math.min(current + 1, Math.max(1, totalPages)))
                            }
                            disabled={page >= totalPages || loading}
                            className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-50"
                        >
                            Suivant
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
}
