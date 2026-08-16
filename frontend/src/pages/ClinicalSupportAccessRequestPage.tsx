import { useCallback, useContext, useEffect, useState } from "react";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { labels } from "../i18n/uiLabels";
import { useTranslation } from "../hooks/useTranslation";
import {
    claimClinicalSupportRequest,
    listOpenClinicalSupportRequests,
    type ClinicalSupportAccessRequest,
    type ClinicalSupportReasonCode,
} from "../services/clinicalSupportAccessApi";

function formatDate(value: string, locale: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale === "fr" ? "fr-CA" : locale);
}

function shortReference(patientId: string) { return patientId.slice(-8).toUpperCase(); }

function useRequestLabels(targetLang: string) {
    const source = labels.clinicalSupportAccessRequestPage;
    const translate = (text: string, key: string) => useTranslation({ text, targetLang, translationKey: `clinicalSupportAccessRequestPage.${key}` }).translated;
    return {
        title: translate(source.title, "title"), description: translate(source.description, "description"),
        loading: translate(source.loading, "loading"), empty: translate(source.empty, "empty"),
        requestedAt: translate(source.requestedAt, "requestedAt"), dossier: translate(source.dossier, "dossier"),
        reason: translate(source.reason, "reason"), claim: translate(source.claim, "claim"),
        claiming: translate(source.claiming, "claiming"), claimed: translate(source.claimed, "claimed"),
        justification: translate(source.justification, "justification"),
        technicalSupport: translate(source.reasons.technicalSupport, "reasons.technicalSupport"),
        securityIncident: translate(source.reasons.securityIncident, "reasons.securityIncident"),
        dataAccessRequest: translate(source.reasons.dataAccessRequest, "reasons.dataAccessRequest"),
    };
}

export function ClinicalSupportAccessRequestPage() {
    const i18n = useContext(HomeI18nContext) || { locale: "fr" };
    const text = useRequestLabels(i18n.locale);
    const [requests, setRequests] = useState<ClinicalSupportAccessRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [claimingId, setClaimingId] = useState("");
    const [justificationById, setJustificationById] = useState<Record<string, ClinicalSupportReasonCode>>({});
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const load = useCallback(async () => {
        setLoading(true); setError("");
        const response = await listOpenClinicalSupportRequests();
        if ("error" in response) { setRequests([]); setError(response.error.message); }
        else setRequests(response.data);
        setLoading(false);
    }, []);
    useEffect(() => { void load(); }, [load]);
    const reasonLabel = (code: ClinicalSupportReasonCode) => ({ TECHNICAL_SUPPORT: text.technicalSupport, SECURITY_INCIDENT: text.securityIncident, DATA_ACCESS_REQUEST: text.dataAccessRequest })[code];
    const claim = async (request: ClinicalSupportAccessRequest) => {
        setClaimingId(request.id); setError(""); setSuccess("");
        const response = await claimClinicalSupportRequest(request.id, justificationById[request.id] || "TECHNICAL_SUPPORT");
        setClaimingId("");
        if ("error" in response) { setError(response.error.message); await load(); return; }
        setSuccess(text.claimed); await load();
    };
    return <section className="mx-auto max-w-5xl space-y-5 px-4 py-8"><div><h1 className="text-2xl font-semibold text-gray-900">{text.title}</h1><p className="mt-1 max-w-3xl text-sm text-gray-600">{text.description}</p></div>{error && <div role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}{success && <div role="status" className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>}{loading ? <p className="text-sm text-gray-600">{text.loading}</p> : requests.length === 0 ? <div className="rounded border border-gray-200 bg-white p-6 text-sm text-gray-600">{text.empty}</div> : <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm"><table className="min-w-full divide-y divide-gray-200 text-left text-sm"><thead className="bg-gray-50 text-gray-700"><tr>{[text.requestedAt, text.dossier, text.reason, text.justification, text.claim].map((heading) => <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">{requests.map((request) => <tr key={request.id}><td className="px-4 py-3 text-gray-700">{formatDate(request.requestedAt, i18n.locale)}</td><td className="px-4 py-3 font-mono text-gray-900">{text.dossier} #{shortReference(request.patientId)}</td><td className="px-4 py-3 text-gray-700">{reasonLabel(request.reasonCode)}</td><td className="px-4 py-3"><select value={justificationById[request.id] || "TECHNICAL_SUPPORT"} onChange={(event) => setJustificationById((current) => ({ ...current, [request.id]: event.target.value as ClinicalSupportReasonCode }))} className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"><option value="TECHNICAL_SUPPORT">{text.technicalSupport}</option><option value="SECURITY_INCIDENT">{text.securityIncident}</option><option value="DATA_ACCESS_REQUEST">{text.dataAccessRequest}</option></select></td><td className="px-4 py-3"><button type="button" disabled={claimingId !== ""} onClick={() => void claim(request)} className="rounded border border-blue-600 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60">{claimingId === request.id ? text.claiming : text.claim}</button></td></tr>)}</tbody></table></div>}</section>;
}
