import { useCallback, useContext, useEffect, useState } from "react";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { labels } from "../i18n/uiLabels";
import { useTranslation } from "../hooks/useTranslation";
import {
    decideClinicalSupportAccess,
    listActiveClinicalSupportAccess,
    listClinicalSupportAccessInbox,
    revokeClinicalSupportAccess,
    type ActiveClinicalSupportAccess,
    type ClinicalSupportAccessRequest,
    type ClinicalSupportReasonCode,
} from "../services/clinicalSupportAccessApi";

function formatDate(value: string, locale: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? value
        : date.toLocaleString(locale === "fr" ? "fr-CA" : locale);
}

function shortPatientReference(patientId: string) {
    return patientId.slice(-8).toUpperCase();
}

function useInboxLabels(targetLang: string) {
    const source = labels.clinicalSupportAccessInbox;
    const translate = (text: string, key: string) =>
        useTranslation({ text, targetLang, translationKey: `clinicalSupportAccessInbox.${key}` }).translated;

    return {
        title: translate(source.title, "title"),
        description: translate(source.description, "description"),
        refresh: translate(source.refresh, "refresh"),
        loading: translate(source.loading, "loading"),
        empty: translate(source.empty, "empty"),
        activeTitle: translate(source.activeTitle, "activeTitle"),
        activeDescription: translate(source.activeDescription, "activeDescription"),
        activeEmpty: translate(source.activeEmpty, "activeEmpty"),
        expiresAt: translate(source.expiresAt, "expiresAt"),
        revoke: translate(source.revoke, "revoke"),
        revoking: translate(source.revoking, "revoking"),
        revoked: translate(source.revoked, "revoked"),
        requestedAt: translate(source.requestedAt, "requestedAt"),
        dossier: translate(source.dossier, "dossier"),
        reason: translate(source.reason, "reason"),
        superadminJustification: translate(source.superadminJustification, "superadminJustification"),
        duration: translate(source.duration, "duration"),
        approve: translate(source.approve, "approve"),
        approving: translate(source.approving, "approving"),
        reject: translate(source.reject, "reject"),
        rejecting: translate(source.rejecting, "rejecting"),
        approved: translate(source.approved, "approved"),
        rejected: translate(source.rejected, "rejected"),
        technicalSupport: translate(source.reasons.technicalSupport, "reasons.technicalSupport"),
        securityIncident: translate(source.reasons.securityIncident, "reasons.securityIncident"),
        dataAccessRequest: translate(source.reasons.dataAccessRequest, "reasons.dataAccessRequest"),
    };
}

export function ClinicalSupportAccessInboxPage() {
    const i18n = useContext(HomeI18nContext) || { locale: "fr" };
    const text = useInboxLabels(i18n.locale);
    const [requests, setRequests] = useState<ClinicalSupportAccessRequest[]>([]);
    const [activeAccesses, setActiveAccesses] = useState<ActiveClinicalSupportAccess[]>([]);
    const [durationMinutes, setDurationMinutes] = useState(15);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        const [inboxResponse, activeResponse] = await Promise.all([
            listClinicalSupportAccessInbox(),
            listActiveClinicalSupportAccess(),
        ]);
        if ("error" in inboxResponse) {
            setRequests([]);
            setError(inboxResponse.error.message);
        } else {
            setRequests(inboxResponse.data);
        }
        if ("error" in activeResponse) {
            setActiveAccesses([]);
            setError((current) => current || activeResponse.error.message);
        } else {
            setActiveAccesses(activeResponse.data);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const reasonLabel = (reasonCode: ClinicalSupportReasonCode) => ({
        TECHNICAL_SUPPORT: text.technicalSupport,
        SECURITY_INCIDENT: text.securityIncident,
        DATA_ACCESS_REQUEST: text.dataAccessRequest,
    })[reasonCode];

    const decide = async (request: ClinicalSupportAccessRequest, decision: "APPROVE" | "REJECT") => {
        setBusyId(request.id);
        setError("");
        setSuccess("");
        const response = await decideClinicalSupportAccess(
            request.id,
            decision,
            decision === "APPROVE" ? durationMinutes : undefined
        );
        setBusyId("");
        if ("error" in response) {
            setError(response.error.message);
            return;
        }
        setSuccess(decision === "APPROVE" ? text.approved : text.rejected);
        await load();
    };

    const revoke = async (access: ActiveClinicalSupportAccess) => {
        setBusyId(access.id);
        setError("");
        setSuccess("");
        const response = await revokeClinicalSupportAccess(access.id);
        setBusyId("");
        if ("error" in response) {
            setError(response.error.message);
            return;
        }
        setSuccess(text.revoked);
        await load();
    };

    return (
        <section className="mx-auto max-w-5xl space-y-5 px-4 py-8">
            <div>
                <h1 className="text-2xl font-semibold text-gray-900">{text.title}</h1>
                <p className="mt-1 max-w-3xl text-sm text-gray-600">{text.description}</p>
            </div>

            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                    {text.duration}
                    <select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="rounded border border-gray-300 bg-white px-3 py-2 font-normal">
                        {[5, 10, 15, 30, 45, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
                    </select>
                </label>
                <button type="button" onClick={() => void load()} disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                    {text.refresh}
                </button>
            </div>

            {error && <div role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
            {success && <div role="status" className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>}

            {loading ? <p className="text-sm text-gray-600">{text.loading}</p> : requests.length === 0 ? (
                <div className="rounded border border-gray-200 bg-white p-6 text-sm text-gray-600">{text.empty}</div>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                    <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                        <thead className="bg-gray-50 text-gray-700"><tr>{[text.requestedAt, text.dossier, text.reason, text.superadminJustification, text.approve].map((heading) => <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>)}</tr></thead>
                        <tbody className="divide-y divide-gray-100">
                            {requests.map((request) => (
                                <tr key={request.id}>
                                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatDate(request.requestedAt, i18n.locale)}</td>
                                    <td className="whitespace-nowrap px-4 py-3 font-mono text-gray-900">{text.dossier} #{shortPatientReference(request.patientId)}</td>
                                    <td className="px-4 py-3 text-gray-700">{reasonLabel(request.reasonCode)}</td>
                                    <td className="px-4 py-3 text-gray-700">{request.superadminJustificationCode ? reasonLabel(request.superadminJustificationCode) : "—"}</td>
                                    <td className="whitespace-nowrap px-4 py-3">
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => void decide(request, "APPROVE")} disabled={busyId !== ""} className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
                                                {busyId === request.id ? text.approving : text.approve}
                                            </button>
                                            <button type="button" onClick={() => void decide(request, "REJECT")} disabled={busyId !== ""} className="rounded border border-red-600 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60">
                                                {busyId === request.id ? text.rejecting : text.reject}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="space-y-3 border-t border-gray-200 pt-5">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">{text.activeTitle}</h2>
                    <p className="mt-1 text-sm text-gray-600">{text.activeDescription}</p>
                </div>
                {loading ? null : activeAccesses.length === 0 ? (
                    <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-600">{text.activeEmpty}</div>
                ) : (
                    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                        <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                            <thead className="bg-gray-50 text-gray-700"><tr>{[text.dossier, text.reason, text.expiresAt, text.revoke].map((heading) => <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>)}</tr></thead>
                            <tbody className="divide-y divide-gray-100">
                                {activeAccesses.map((access) => (
                                    <tr key={access.id}>
                                        <td className="whitespace-nowrap px-4 py-3 font-mono text-gray-900">{text.dossier} #{shortPatientReference(access.patientId)}</td>
                                        <td className="px-4 py-3 text-gray-700">{reasonLabel(access.reasonCode)}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatDate(access.expiresAt, i18n.locale)}</td>
                                        <td className="px-4 py-3"><button type="button" onClick={() => void revoke(access)} disabled={busyId !== ""} className="rounded border border-red-600 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60">{busyId === access.id ? text.revoking : text.revoke}</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}
