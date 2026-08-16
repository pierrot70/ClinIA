import { Fragment, useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Copy, Eye, RefreshCw, Search, X } from "lucide-react";
import { labels } from "../i18n/uiLabels";
import { fetchPatientsPaginated, type Patient } from "../services/patientsApi";
import {
    fetchMyWriteReceipts,
    type MyWriteReceipt,
    type WriteOperationAuditOperation,
} from "../services/writeOperationAuditsApi";
import { useDebounce } from "../hooks/useDebounce";

const LIMIT = 25;
const COLLECTIONS = ["", "patients", "appointments", "diagnosisresults", "cliniciancomments"];
const OPERATIONS: Array<"" | WriteOperationAuditOperation> = ["", "CREATE", "UPDATE", "DELETE", "REPLY"];

function formatTimestamp(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString("fr-CA");
}

function receiptStatus(receipt: MyWriteReceipt) {
    const replica = receipt.replicaSet;
    if (!replica) return "UNKNOWN";
    return replica.status;
}

function receiptStatusClass(status: string) {
    if (status === "OK") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    if (status === "DEGRADED" || status === "LAGGING") return "bg-amber-50 text-amber-700 ring-amber-200";
    return "bg-red-50 text-red-700 ring-red-200";
}

function formatWriteConcern(receipt: MyWriteReceipt) {
    if (!receipt.writeConcern) return "-";
    const parts = [];
    if (receipt.writeConcern.w != null) parts.push(`w=${receipt.writeConcern.w}`);
    if (receipt.writeConcern.j != null) parts.push(`j=${receipt.writeConcern.j ? "true" : "false"}`);
    if (receipt.writeConcern.wtimeout != null) parts.push(`timeout=${receipt.writeConcern.wtimeout}`);
    return parts.join(" ") || "-";
}

export function MyWriteReceiptsPage() {
    const pageLabels = labels.myWriteReceipts;
    const [patients, setPatients] = useState<Patient[]>([]);
    const [receipts, setReceipts] = useState<MyWriteReceipt[]>([]);
    const [patientId, setPatientId] = useState("");
    const [patientSearch, setPatientSearch] = useState("");
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [collectionName, setCollectionName] = useState("");
    const [operation, setOperation] = useState<"" | WriteOperationAuditOperation>("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [copiedId, setCopiedId] = useState("");
    const [patientsLoading, setPatientsLoading] = useState(false);
    const [selectedReceiptId, setSelectedReceiptId] = useState("");
    const debouncedPatientSearch = useDebounce(patientSearch, 300);

    const patientNames = useMemo(
        () => new Map(
            [...patients, ...(selectedPatient ? [selectedPatient] : [])]
                .map((patient) => [patient._id, `${patient.prenom} ${patient.nom}`.trim()])
        ),
        [patients, selectedPatient]
    );

    useEffect(() => {
        let active = true;
        const loadPatients = async () => {
            if (selectedPatient) {
                if (active) setPatients([]);
                return;
            }
            const search = debouncedPatientSearch.trim();
            if (search.length < 2) {
                if (active) {
                    setPatients([]);
                    setPatientsLoading(false);
                }
                return;
            }

            setPatientsLoading(true);
            const response = await fetchPatientsPaginated({
                page: 1,
                limit: 50,
                sortBy: "nom",
                sortDir: "asc",
                ...(search ? { q: search } : {}),
            });

            if (active && response.data) setPatients(response.data.data);
            if (active) setPatientsLoading(false);
        };
        void loadPatients();
        return () => { active = false; };
    }, [debouncedPatientSearch, selectedPatient]);

    const loadReceipts = async (requestedPage = page) => {
        setLoading(true);
        setError("");
        const response = await fetchMyWriteReceipts({
            page: requestedPage,
            limit: LIMIT,
            patientId: patientId || undefined,
            collectionName: collectionName || undefined,
            operation,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
        });
        if (response.error) {
            setError(response.error.message);
            setReceipts([]);
        } else if (response.data) {
            setReceipts(response.data.logs);
            setTotal(response.data.pagination.total);
            setTotalPages(response.data.pagination.totalPages);
            setPage(response.data.pagination.page);
        }
        setLoading(false);
    };

    useEffect(() => { void loadReceipts(1); }, []);

    const search = () => { setPage(1); void loadReceipts(1); };
    const reset = () => {
        setPatientId("");
        setPatientSearch("");
        setSelectedPatient(null);
        setCollectionName("");
        setOperation("");
        setStartDate("");
        setEndDate("");
        setPage(1);
        setSelectedReceiptId("");
        window.setTimeout(() => void loadReceipts(1), 0);
    };

    const copy = async (verificationId: string | null) => {
        if (!verificationId) return;
        try {
            await navigator.clipboard.writeText(verificationId);
            setCopiedId(verificationId);
            window.setTimeout(() => setCopiedId(""), 1500);
        } catch {
            setError("Impossible de copier le reçu.");
        }
    };

    return (
        <main className="mx-auto max-w-7xl space-y-5 px-4 py-8 pb-28 lg:pb-8">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-950">
                        <ClipboardCheck className="h-6 w-6 text-slate-600" />
                        {pageLabels.title}
                    </h1>
                    <p className="mt-1 max-w-3xl text-sm text-gray-600">{pageLabels.description}</p>
                </div>
                <button type="button" onClick={() => void loadReceipts()} className="inline-flex items-center gap-2 rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
                    <RefreshCw className="h-4 w-4" />
                    {pageLabels.actions.search}
                </button>
            </header>

            <section className="border border-gray-200 bg-white p-4 shadow-sm">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div className="relative text-sm text-gray-700">
                        <span>{pageLabels.filters.patient}</span>
                        {selectedPatient ? (
                            <div className="mt-1 flex min-h-10 items-center justify-between rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
                                <span className="font-medium">{selectedPatient.prenom} {selectedPatient.nom}</span>
                                <button type="button" onClick={() => { setPatientId(""); setSelectedPatient(null); setPatientSearch(""); }} className="inline-flex rounded p-1 text-sky-800 hover:bg-sky-100" title={pageLabels.actions.clearPatient}><X className="h-4 w-4" /><span className="sr-only">{pageLabels.actions.clearPatient}</span></button>
                            </div>
                        ) : <>
                            <div className="relative mt-1">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                <input value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} placeholder={pageLabels.placeholders.patientSearch} className="block w-full rounded border border-gray-300 py-2 pl-9 pr-3 text-sm" />
                            </div>
                            <p className="mt-1 text-xs text-gray-500">{patientsLoading ? pageLabels.status.patientsLoading : pageLabels.status.patientSearchHint}</p>
                            {patientSearch.trim().length >= 2 && !patientsLoading && patients.length === 0 && <p className="mt-1 text-xs text-gray-500">{pageLabels.status.patientSearchEmpty}</p>}
                            {patients.length > 0 && <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded border border-gray-200 bg-white py-1 shadow-lg">
                                {patients.map((patient) => <button key={patient._id} type="button" onClick={() => { setPatientId(patient._id); setSelectedPatient(patient); setPatientSearch(`${patient.prenom} ${patient.nom}`); setPatients([]); }} className="block w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-sky-50"><span className="font-medium">{patient.prenom} {patient.nom}</span></button>)}
                            </div>}
                        </>}
                    </div>
                    <label className="text-sm text-gray-700">{pageLabels.filters.collection}
                        <select value={collectionName} onChange={(event) => setCollectionName(event.target.value)} className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm">
                            {COLLECTIONS.map((value) => <option key={value || "all"} value={value}>{value || pageLabels.filters.allCollections}</option>)}
                        </select>
                    </label>
                    <label className="text-sm text-gray-700">{pageLabels.filters.operation}
                        <select value={operation} onChange={(event) => setOperation(event.target.value as "" | WriteOperationAuditOperation)} className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm">
                            {OPERATIONS.map((value) => <option key={value || "all"} value={value}>{value || pageLabels.filters.allOperations}</option>)}
                        </select>
                    </label>
                    <label className="text-sm text-gray-700">{pageLabels.filters.startDate}
                        <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm" />
                    </label>
                    <label className="text-sm text-gray-700">{pageLabels.filters.endDate}
                        <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm" />
                    </label>
                </div>
                <div className="mt-4 flex items-center gap-3">
                    <button type="button" onClick={search} className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">{pageLabels.actions.search}</button>
                    <button type="button" onClick={reset} className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">{pageLabels.actions.reset}</button>
                    <span className="text-sm text-gray-500">{total} {pageLabels.status.results}</span>
                </div>
            </section>

            <section className="border border-gray-200 bg-white shadow-sm md:hidden">
                {error && <p className="m-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                {loading ? <p className="p-6 text-sm text-gray-600">{pageLabels.status.loading}</p> : receipts.length === 0 ? <p className="p-6 text-sm text-gray-600">{pageLabels.status.empty}</p> : (
                    <div className="divide-y divide-gray-100">
                        {receipts.map((receipt, index) => {
                            const status = receiptStatus(receipt);
                            const patientName = receipt.patientId ? patientNames.get(receipt.patientId) : null;
                            const receiptKey = `${receipt.verificationId || "receipt"}-${receipt.timestamp}-${index}`;
                            const expanded = selectedReceiptId === receiptKey;
                            return <article key={receiptKey} className="space-y-2 p-4 text-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <time className="text-xs text-gray-600">{formatTimestamp(receipt.timestamp)}</time>
                                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${receiptStatusClass(status)}`}>{status}</span>
                                </div>
                                <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                                    <div><dt className="text-xs uppercase text-gray-500">{pageLabels.table.patient}</dt><dd className="mt-0.5 font-medium text-gray-900">{patientName || (receipt.patientId ? pageLabels.unavailablePatient : pageLabels.noPatient)}</dd></div>
                                    <div><dt className="text-xs uppercase text-gray-500">{pageLabels.table.collection}</dt><dd className="mt-0.5 break-words text-gray-800">{receipt.collectionName}</dd></div>
                                    <div><dt className="text-xs uppercase text-gray-500">{pageLabels.table.operation}</dt><dd className="mt-0.5 text-gray-800">{receipt.operation}</dd></div>
                                    <div><dt className="text-xs uppercase text-gray-500">{pageLabels.table.replica}</dt><dd className="mt-0.5 text-gray-800">{receipt.replicaSet?.healthyCount ?? "-"}/{receipt.replicaSet?.memberCount ?? "-"} {pageLabels.healthy}</dd></div>
                                </dl>
                                <button type="button" onClick={() => setSelectedReceiptId(expanded ? "" : receiptKey)} className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">{expanded ? pageLabels.actions.hideDetails : pageLabels.actions.showDetails}</button>
                                {expanded && <div className="rounded bg-slate-50 p-3 text-xs text-gray-700"><div><span className="font-medium">{pageLabels.details.verification}: </span><code className="break-all">{receipt.verificationId || "-"}</code></div><div className="mt-2"><span className="font-medium">{pageLabels.details.fields}: </span>{receipt.changedFields.length ? receipt.changedFields.join(", ") : "-"}</div></div>}
                            </article>;
                        })}
                    </div>
                )}
                <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
                    <span>{page} / {totalPages}</span>
                    <div className="flex gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => void loadReceipts(page - 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50">{pageLabels.actions.previous}</button><button type="button" disabled={page >= totalPages || loading} onClick={() => void loadReceipts(page + 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50">{pageLabels.actions.next}</button></div>
                </div>
            </section>

            <section className="hidden overflow-x-auto border border-gray-200 bg-white shadow-sm md:block">
                {error && <p className="m-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                {loading ? <p className="p-6 text-sm text-gray-600">{pageLabels.status.loading}</p> : receipts.length === 0 ? <p className="p-6 text-sm text-gray-600">{pageLabels.status.empty}</p> : (
                    <table className="min-w-full text-left text-sm">
                        <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-600"><tr>
                            <th className="px-4 py-3">{pageLabels.table.date}</th><th className="px-4 py-3">{pageLabels.table.patient}</th><th className="px-4 py-3">{pageLabels.table.collection}</th><th className="px-4 py-3">{pageLabels.table.operation}</th><th className="px-4 py-3">{pageLabels.table.verification}</th><th className="px-4 py-3">{pageLabels.table.fields}</th><th className="px-4 py-3">{pageLabels.table.replica}</th><th className="px-4 py-3"><span className="sr-only">{pageLabels.table.details}</span></th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-100">
                            {receipts.map((receipt, index) => {
                                const status = receiptStatus(receipt);
                                const patientName = receipt.patientId ? patientNames.get(receipt.patientId) : null;
                                const receiptKey = `${receipt.verificationId || "receipt"}-${receipt.timestamp}-${index}`;
                                const expanded = selectedReceiptId === receiptKey;
                                const replica = receipt.replicaSet;
                                return <Fragment key={receiptKey}>
                                    <tr key={receiptKey}>
                                        <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatTimestamp(receipt.timestamp)}</td>
                                        <td className="px-4 py-3 font-medium text-gray-900">{patientName || (receipt.patientId ? pageLabels.unavailablePatient : pageLabels.noPatient)}</td>
                                        <td className="px-4 py-3 text-gray-800">{receipt.collectionName}</td>
                                        <td className="px-4 py-3 text-gray-800">{receipt.operation}</td>
                                        <td className="px-4 py-3"><div className="flex min-w-56 items-center gap-2"><code className="break-all text-xs text-gray-800">{receipt.verificationId}</code><button type="button" onClick={() => void copy(receipt.verificationId)} className="inline-flex shrink-0 items-center gap-1 rounded border border-gray-300 p-2 text-gray-700 hover:bg-gray-50" title={pageLabels.actions.copy}><Copy className="h-4 w-4" /><span className="sr-only">{copiedId === receipt.verificationId ? pageLabels.actions.copied : pageLabels.actions.copy}</span></button></div></td>
                                        <td className="px-4 py-3 text-gray-700">{receipt.changedFields.length ? receipt.changedFields.join(", ") : "-"}</td>
                                        <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${receiptStatusClass(status)}`}>{status}</span><div className="mt-1 text-xs text-gray-500">{replica?.healthyCount ?? "-"}/{replica?.memberCount ?? "-"} {pageLabels.healthy}</div></td>
                                        <td className="px-4 py-3"><button type="button" onClick={() => setSelectedReceiptId(expanded ? "" : receiptKey)} className="inline-flex items-center gap-2 rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"><Eye className="h-4 w-4" />{expanded ? pageLabels.actions.hideDetails : pageLabels.actions.showDetails}</button></td>
                                    </tr>
                                    {expanded && <tr className="bg-slate-50"><td colSpan={8} className="px-4 py-4"><section aria-label={pageLabels.details.title} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><div><h2 className="text-sm font-semibold text-gray-950">{pageLabels.details.title}</h2><dl className="mt-3 space-y-2 text-sm"><div><dt className="text-xs uppercase text-gray-500">{pageLabels.details.verification}</dt><dd className="break-all font-mono text-xs text-gray-900">{receipt.verificationId}</dd></div><div><dt className="text-xs uppercase text-gray-500">{pageLabels.details.date}</dt><dd>{formatTimestamp(receipt.timestamp)}</dd></div></dl></div><dl className="space-y-2 text-sm"><div><dt className="text-xs uppercase text-gray-500">{pageLabels.details.patient}</dt><dd>{patientName || (receipt.patientId ? pageLabels.unavailablePatient : pageLabels.noPatient)}</dd></div><div><dt className="text-xs uppercase text-gray-500">{pageLabels.details.collection}</dt><dd>{receipt.collectionName}</dd></div><div><dt className="text-xs uppercase text-gray-500">{pageLabels.details.operation}</dt><dd>{receipt.operation}</dd></div></dl><dl className="space-y-2 text-sm"><div><dt className="text-xs uppercase text-gray-500">{pageLabels.details.fields}</dt><dd>{receipt.changedFields.length ? receipt.changedFields.join(", ") : "-"}</dd></div><div><dt className="text-xs uppercase text-gray-500">{pageLabels.details.writeConcern}</dt><dd className="font-mono text-xs">{formatWriteConcern(receipt)}</dd></div><div><dt className="text-xs uppercase text-gray-500">{pageLabels.details.resource}</dt><dd className="break-all font-mono text-xs">{receipt.resourceId || "-"}</dd></div></dl><dl className="space-y-2 text-sm"><div><dt className="text-xs uppercase text-gray-500">{pageLabels.details.persistence}</dt><dd>{replica?.majorityAvailable ? pageLabels.details.confirmed : pageLabels.details.unavailable}</dd></div><div><dt className="text-xs uppercase text-gray-500">{pageLabels.details.replica}</dt><dd>{status} · {replica?.healthyCount ?? "-"}/{replica?.memberCount ?? "-"} {pageLabels.healthy}</dd></div><div><dt className="text-xs uppercase text-gray-500">{pageLabels.details.lag}</dt><dd>{replica?.maxLagSeconds == null ? "-" : `${replica.maxLagSeconds}s`}</dd></div></dl></section></td></tr>}
                                </Fragment>;
                            })}
                        </tbody>
                    </table>
                )}
                <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
                    <span>{page} / {totalPages}</span>
                    <div className="flex gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => void loadReceipts(page - 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50">{pageLabels.actions.previous}</button><button type="button" disabled={page >= totalPages || loading} onClick={() => void loadReceipts(page + 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50">{pageLabels.actions.next}</button></div>
                </div>
            </section>
        </main>
    );
}
