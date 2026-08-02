import { useCallback, useContext, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { labels } from "../i18n/uiLabels";
import { useTranslation } from "../hooks/useTranslation";
import {
    listCoordinationRequests,
    verifyCoordinationRequestAvailability,
    type CoordinationRequestEntry,
    type CoordinationRequestStatus,
} from "../services/coordinationRequestsApi";

const PAGE_LIMIT = 20;

function formatDate(value: string, locale: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? value
        : date.toLocaleString(locale === "fr" ? "fr-CA" : locale);
}

function useCoordinationRequestsLabels(targetLang: string) {
    const pageLabels = labels.coordinationRequestsPage;
    const title = useTranslation({ text: pageLabels.title, targetLang, translationKey: "coordinationRequestsPage.title" });
    const description = useTranslation({ text: pageLabels.description, targetLang, translationKey: "coordinationRequestsPage.description" });
    const refresh = useTranslation({ text: pageLabels.refresh, targetLang, translationKey: "coordinationRequestsPage.refresh" });
    const status = useTranslation({ text: pageLabels.status, targetLang, translationKey: "coordinationRequestsPage.status" });
    const allStatuses = useTranslation({ text: pageLabels.allStatuses, targetLang, translationKey: "coordinationRequestsPage.allStatuses" });
    const open = useTranslation({ text: pageLabels.open, targetLang, translationKey: "coordinationRequestsPage.open" });
    const readyToSchedule = useTranslation({ text: pageLabels.readyToSchedule, targetLang, translationKey: "coordinationRequestsPage.readyToSchedule" });
    const resolved = useTranslation({ text: pageLabels.resolved, targetLang, translationKey: "coordinationRequestsPage.resolved" });
    const cancelled = useTranslation({ text: pageLabels.cancelled, targetLang, translationKey: "coordinationRequestsPage.cancelled" });
    const loading = useTranslation({ text: pageLabels.loading, targetLang, translationKey: "coordinationRequestsPage.loading" });
    const empty = useTranslation({ text: pageLabels.empty, targetLang, translationKey: "coordinationRequestsPage.empty" });
    const createdAt = useTranslation({ text: pageLabels.createdAt, targetLang, translationKey: "coordinationRequestsPage.createdAt" });
    const patient = useTranslation({ text: pageLabels.patient, targetLang, translationKey: "coordinationRequestsPage.patient" });
    const specialty = useTranslation({ text: pageLabels.specialty, targetLang, translationKey: "coordinationRequestsPage.specialty" });
    const requestedBy = useTranslation({ text: pageLabels.requestedBy, targetLang, translationKey: "coordinationRequestsPage.requestedBy" });
    const action = useTranslation({ text: pageLabels.action, targetLang, translationKey: "coordinationRequestsPage.action" });
    const verifyAvailability = useTranslation({ text: pageLabels.verifyAvailability, targetLang, translationKey: "coordinationRequestsPage.verifyAvailability" });
    const verifying = useTranslation({ text: pageLabels.verifying, targetLang, translationKey: "coordinationRequestsPage.verifying" });
    const availabilityVerified = useTranslation({ text: pageLabels.availabilityVerified, targetLang, translationKey: "coordinationRequestsPage.availabilityVerified" });
    const patientUnavailable = useTranslation({ text: pageLabels.patientUnavailable, targetLang, translationKey: "coordinationRequestsPage.patientUnavailable" });
    const requesterUnavailable = useTranslation({ text: pageLabels.requesterUnavailable, targetLang, translationKey: "coordinationRequestsPage.requesterUnavailable" });
    const previous = useTranslation({ text: pageLabels.previous, targetLang, translationKey: "coordinationRequestsPage.previous" });
    const next = useTranslation({ text: pageLabels.next, targetLang, translationKey: "coordinationRequestsPage.next" });
    const page = useTranslation({ text: pageLabels.page, targetLang, translationKey: "coordinationRequestsPage.page" });

    return {
        title: title.translated, description: description.translated, refresh: refresh.translated,
        status: status.translated, allStatuses: allStatuses.translated, open: open.translated,
        readyToSchedule: readyToSchedule.translated, resolved: resolved.translated, cancelled: cancelled.translated, loading: loading.translated,
        empty: empty.translated, createdAt: createdAt.translated, patient: patient.translated,
        specialty: specialty.translated, requestedBy: requestedBy.translated, action: action.translated,
        verifyAvailability: verifyAvailability.translated, verifying: verifying.translated,
        availabilityVerified: availabilityVerified.translated,
        patientUnavailable: patientUnavailable.translated, requesterUnavailable: requesterUnavailable.translated,
        previous: previous.translated, next: next.translated, page: page.translated,
    };
}

export function CoordinationRequestsPage() {
    const i18n = useContext(HomeI18nContext) || { locale: "fr" };
    const targetLang = i18n.locale;
    const text = useCoordinationRequestsLabels(targetLang);
    const [entries, setEntries] = useState<CoordinationRequestEntry[]>([]);
    const [status, setStatus] = useState<CoordinationRequestStatus | "">("open");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [verifyingId, setVerifyingId] = useState("");
    const [success, setSuccess] = useState("");

    const load = useCallback(async (requestedPage: number) => {
        setLoading(true);
        setError("");
        const response = await listCoordinationRequests({
            page: requestedPage,
            limit: PAGE_LIMIT,
            status,
        });
        if ("error" in response) {
            setEntries([]);
            setError(response.error.message);
        } else {
            setEntries(response.data.requests);
            setPage(response.data.pagination.page);
            setTotalPages(response.data.pagination.totalPages);
        }
        setLoading(false);
    }, [status]);

    useEffect(() => {
        void load(1);
    }, [load]);

    const updateStatus = (value: string) => {
        setStatus(value as CoordinationRequestStatus | "");
        setPage(1);
    };

    const verifyAvailability = async (entry: CoordinationRequestEntry) => {
        setVerifyingId(entry.id);
        setError("");
        setSuccess("");
        const response = await verifyCoordinationRequestAvailability(entry.id);
        setVerifyingId("");
        if ("error" in response) {
            setError(response.error.message);
            return;
        }
        const availability = response.data.availability;
        setSuccess(
            text.availabilityVerified
                .replace("{clinic}", availability.clinique.nom)
                .replace("{specialist}", `${availability.specialist.prenom} ${availability.specialist.nom}`)
                .replace("{date}", availability.date)
                .replace("{time}", availability.time)
        );
        await load(page);
    };

    const statusLabel = (value: CoordinationRequestStatus) => ({
        open: text.open,
        ready_to_schedule: text.readyToSchedule,
        resolved: text.resolved,
        cancelled: text.cancelled,
    })[value];

    return (
        <section className="mx-auto max-w-6xl space-y-5 px-4 py-8">
            <div>
                <h1 className="text-2xl font-semibold text-gray-900">{text.title}</h1>
                <p className="mt-1 text-sm text-gray-600">{text.description}</p>
            </div>
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                    {text.status}
                    <select value={status} onChange={(event) => updateStatus(event.target.value)} className="min-w-48 rounded border border-gray-300 bg-white px-3 py-2 font-normal">
                        <option value="">{text.allStatuses}</option>
                        <option value="open">{text.open}</option>
                        <option value="ready_to_schedule">{text.readyToSchedule}</option>
                        <option value="resolved">{text.resolved}</option>
                        <option value="cancelled">{text.cancelled}</option>
                    </select>
                </label>
                <button type="button" onClick={() => void load(page)} disabled={loading} className="inline-flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                    <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                    {text.refresh}
                </button>
            </div>
            {error && <div role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
            {success && <div role="status" className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>}
            {loading ? <p className="text-sm text-gray-600">{text.loading}</p> : entries.length === 0 ? (
                <div className="rounded border border-gray-200 bg-white p-6 text-sm text-gray-600">{text.empty}</div>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                    <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                        <thead className="bg-gray-50 text-gray-700"><tr>{[text.createdAt, text.patient, text.specialty, text.requestedBy, text.status, text.action].map((heading) => <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>)}</tr></thead>
                        <tbody className="divide-y divide-gray-100">
                            {entries.map((entry) => (
                                <tr key={entry.id}>
                                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatDate(entry.createdAt, targetLang)}</td>
                                    <td className="whitespace-nowrap px-4 py-3 text-gray-900">{entry.patient ? `${entry.patient.prenom} ${entry.patient.nom}` : text.patientUnavailable}</td>
                                    <td className="px-4 py-3 text-gray-900">{entry.specialty}</td>
                                    <td className="px-4 py-3 text-gray-700">{entry.requestedBy?.username || text.requesterUnavailable}</td>
                                    <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{statusLabel(entry.status)}</span></td>
                                    <td className="px-4 py-3">{entry.status === "open" && <button type="button" onClick={() => void verifyAvailability(entry)} disabled={verifyingId === entry.id} className="rounded border border-blue-600 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60">{verifyingId === entry.id ? text.verifying : text.verifyAvailability}</button>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <div className="flex items-center justify-end gap-3 text-sm text-gray-700">
                <span>{text.page.replace("{page}", String(page)).replace("{totalPages}", String(totalPages))}</span>
                <button type="button" onClick={() => void load(page - 1)} disabled={loading || page <= 1} className="rounded border border-gray-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50">{text.previous}</button>
                <button type="button" onClick={() => void load(page + 1)} disabled={loading || page >= totalPages} className="rounded border border-gray-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50">{text.next}</button>
            </div>
        </section>
    );
}
