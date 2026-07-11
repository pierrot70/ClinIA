import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Copy, RefreshCw } from "lucide-react";
import { labels } from "../i18n/uiLabels";
import { fetchPatientsPaginated, type Patient } from "../services/patientsApi";
import {
    fetchMyWriteReceipts,
    type MyWriteReceipt,
    type WriteOperationAuditOperation,
} from "../services/writeOperationAuditsApi";

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

export function MyWriteReceiptsPage() {
    const pageLabels = labels.myWriteReceipts;
    const [patients, setPatients] = useState<Patient[]>([]);
    const [receipts, setReceipts] = useState<MyWriteReceipt[]>([]);
    const [patientId, setPatientId] = useState("");
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

    const patientNames = useMemo(
        () => new Map(patients.map((patient) => [patient._id, `${patient.prenom} ${patient.nom}`.trim()])),
        [patients]
    );

    useEffect(() => {
        let active = true;
        void fetchPatientsPaginated({ page: 1, limit: 100, sortBy: "nom", sortDir: "asc" }).then((response) => {
            if (active && response.data) setPatients(response.data.data);
        });
        return () => { active = false; };
    }, []);

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
        setCollectionName("");
        setOperation("");
        setStartDate("");
        setEndDate("");
        setPage(1);
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
        <main className="mx-auto max-w-7xl space-y-5 px-4 py-8">
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
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <label className="text-sm text-gray-700">{pageLabels.filters.patient}
                        <select value={patientId} onChange={(event) => setPatientId(event.target.value)} className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm">
                            <option value="">{pageLabels.filters.allPatients}</option>
                            {patients.map((patient) => <option key={patient._id} value={patient._id}>{patient.prenom} {patient.nom}</option>)}
                        </select>
                    </label>
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

            <section className="overflow-x-auto border border-gray-200 bg-white shadow-sm">
                {error && <p className="m-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                {loading ? <p className="p-6 text-sm text-gray-600">{pageLabels.status.loading}</p> : receipts.length === 0 ? <p className="p-6 text-sm text-gray-600">{pageLabels.status.empty}</p> : (
                    <table className="min-w-full text-left text-sm">
                        <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-600"><tr>
                            <th className="px-4 py-3">{pageLabels.table.date}</th><th className="px-4 py-3">{pageLabels.table.patient}</th><th className="px-4 py-3">{pageLabels.table.collection}</th><th className="px-4 py-3">{pageLabels.table.operation}</th><th className="px-4 py-3">{pageLabels.table.verification}</th><th className="px-4 py-3">{pageLabels.table.fields}</th><th className="px-4 py-3">{pageLabels.table.replica}</th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-100">
                            {receipts.map((receipt, index) => {
                                const status = receiptStatus(receipt);
                                const patientName = receipt.patientId ? patientNames.get(receipt.patientId) : null;
                                return <tr key={`${receipt.verificationId || "receipt"}-${receipt.timestamp}-${index}`}>
                                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatTimestamp(receipt.timestamp)}</td>
                                    <td className="px-4 py-3 font-medium text-gray-900">{patientName || (receipt.patientId ? pageLabels.unavailablePatient : pageLabels.noPatient)}</td>
                                    <td className="px-4 py-3 text-gray-800">{receipt.collectionName}</td>
                                    <td className="px-4 py-3 text-gray-800">{receipt.operation}</td>
                                    <td className="px-4 py-3"><div className="flex min-w-56 items-center gap-2"><code className="break-all text-xs text-gray-800">{receipt.verificationId}</code><button type="button" onClick={() => void copy(receipt.verificationId)} className="inline-flex shrink-0 items-center gap-1 rounded border border-gray-300 p-2 text-gray-700 hover:bg-gray-50" title={pageLabels.actions.copy}><Copy className="h-4 w-4" /><span className="sr-only">{copiedId === receipt.verificationId ? pageLabels.actions.copied : pageLabels.actions.copy}</span></button></div></td>
                                    <td className="px-4 py-3 text-gray-700">{receipt.changedFields.length ? receipt.changedFields.join(", ") : "-"}</td>
                                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${receiptStatusClass(status)}`}>{status}</span><div className="mt-1 text-xs text-gray-500">{receipt.replicaSet?.healthyCount ?? "-"}/{receipt.replicaSet?.memberCount ?? "-"} {pageLabels.healthy}</div></td>
                                </tr>;
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
