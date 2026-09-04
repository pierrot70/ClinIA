import { useCallback, useEffect, useState } from "react";
import { labels } from "../i18n/uiLabels";
import { useHomeI18n } from "../contexts/HomeI18nContext";
import { useTranslation } from "../hooks/useTranslation";
import { decideClinicalTermRequest, listPendingClinicalTermRequests, type PendingClinicalTermRequest } from "../services/clinicalTermsApi";

function formatDate(value: string, locale: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale === "fr" ? "fr-CA" : locale);
}

export function ClinicalTermCatalogPage() {
    const { locale } = useHomeI18n();
    const source = labels.clinicalTermCatalog;
    const translate = (text: string, key: string) => useTranslation({ text, targetLang: locale, translationKey: `clinicalTermCatalog.${key}` }).translated;
    const text = Object.fromEntries(Object.entries(source).map(([key, value]) => [key, translate(value, key)])) as typeof source;
    const [requests, setRequests] = useState<PendingClinicalTermRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const load = useCallback(async () => {
        setLoading(true); setError("");
        const response = await listPendingClinicalTermRequests();
        if ("error" in response) setError(response.error.message);
        else setRequests(response.data);
        setLoading(false);
    }, []);

    useEffect(() => { void load(); }, [load]);

    async function decide(request: PendingClinicalTermRequest, decision: "APPROVED" | "REJECTED") {
        setBusyId(request._id); setError(""); setSuccess("");
        const response = await decideClinicalTermRequest(request._id, decision);
        setBusyId("");
        if ("error" in response) { setError(response.error.message); return; }
        setSuccess(decision === "APPROVED" ? text.approved : text.rejected);
        await load();
    }

    return <section className="mx-auto max-w-5xl space-y-5 px-4 py-8">
        <div><h1 className="text-2xl font-semibold text-gray-900">{text.title}</h1><p className="mt-1 max-w-3xl text-sm text-gray-600">{text.description}</p></div>
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{text.privacyNotice}</div>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">{text.refresh}</button>
        {error && <div role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {success && <div role="status" className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>}
        {loading ? <p className="text-sm text-gray-600">{text.loading}</p> : requests.length === 0 ? <div className="rounded border border-gray-200 bg-white p-6 text-sm text-gray-600">{text.empty}</div> : <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm"><table className="min-w-full divide-y divide-gray-200 text-left text-sm"><thead className="bg-gray-50 text-gray-700"><tr><th className="px-4 py-3 font-semibold">{text.term}</th><th className="px-4 py-3 font-semibold">{text.requestedAt}</th><th className="px-4 py-3 font-semibold">{text.actions}</th></tr></thead><tbody className="divide-y divide-gray-100">{requests.map((request) => <tr key={request._id}><td className="px-4 py-3 font-medium text-gray-900">{request.proposedTerm}</td><td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatDate(request.createdAt, locale)}</td><td className="px-4 py-3"><div className="flex gap-2"><button type="button" disabled={busyId !== ""} onClick={() => void decide(request, "APPROVED")} className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60">{busyId === request._id ? text.processing : text.approve}</button><button type="button" disabled={busyId !== ""} onClick={() => void decide(request, "REJECTED")} className="rounded border border-red-600 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60">{text.reject}</button></div></td></tr>)}</tbody></table></div>}
    </section>;
}
