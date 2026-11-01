import { SharedCareProfile } from "../components/clinical/SharedCareProfile";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { useUiLabelTree } from "../hooks/useUiLabels";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { useAuth } from "../hooks/useAuth";
import { clinicalCareAccessLabels } from "../i18n/clinicalCareAccessLabels";
import { listReceivedCareGrants, readSharedCareRecord, appendSharedCareNote,
    careGrantIsActive, type CareGrant, type SharedCareRecord } from "../services/clinicalCareAccessApi";
import { CareNoteList } from "../components/clinical/CareNoteList";
import { WriteVerificationReceipt } from "../components/system/WriteVerificationReceipt";
import type { WriteVerificationMeta } from "../types/api";

export function ClinicalCareAccessPage() {
    const { user } = useAuth();
    const { locale } = useContext(HomeI18nContext) || { locale: "fr" };
    const text = clinicalCareAccessLabels(locale);
    const receiptLabels = useUiLabelTree(UI_LABELS_FR.writeVerification);
    const [grants, setGrants] = useState<CareGrant[]>([]);
    const [record, setRecord] = useState<SharedCareRecord | null>(null);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const [uncertain, setUncertain] = useState(false);
    const [error, setError] = useState<"error" | "unavailable" | null>(null);
    const [message, setMessage] = useState<"noteSaved" | null>(null);
    const [receipt, setReceipt] = useState<WriteVerificationMeta | null>(null);
    const epoch = useRef(0);
    const writing = useRef(false);
    const load = useCallback(async () => {
        if (user?.role !== "MEDECIN") return;
        const request = ++epoch.current;
        setLoading(true); setError(null); setRecord(null); setGrants([]); setConfirmed(false);
        const response = await listReceivedCareGrants();
        if (request !== epoch.current) return;
        setLoading(false);
        if ("error" in response) { if (response.error.code === "FORBIDDEN") setError("unavailable"); else setError("error"); return; }
        setGrants(response.data);
    }, [user?.id, user?.role]);
    useEffect(() => {
        setRecord(null); setNote(""); setConfirmed(false); setError(null); setMessage(null); setReceipt(null);
        if (user?.role === "MEDECIN") void load();
        else setGrants([]);
        return () => { epoch.current++; };
    }, [load, user?.role]);
    useEffect(() => {
        if (!record) return;
        const delay = Math.max(0, Date.parse(record.grant.expiresAt) - Date.now());
        const timer = setTimeout(() => {
            epoch.current++; setRecord(null); setNote(""); setConfirmed(false); setReceipt(null); setError("unavailable");
        }, delay);
        return () => clearTimeout(timer);
    }, [record]);
    const open = async (grant: CareGrant, refreshing = false) => {
        if (user?.role !== "MEDECIN" || writing.current || (!refreshing && note.trim()) || !careGrantIsActive(grant)) return;
        const request = ++epoch.current;
        setLoading(true); setError(null); setRecord(null); setConfirmed(false); setReceipt(null);
        const response = await readSharedCareRecord(grant._id);
        if (request !== epoch.current) return;
        setLoading(false);
        if ("error" in response) { if (response.error.code === "FORBIDDEN") setError("unavailable"); else setError("error"); return; }
        if (!careGrantIsActive(response.data.grant)) { setError("unavailable"); return; }
        setRecord(response.data); setUncertain(false);
    };
    const append = async () => {
        if (writing.current || !record || !confirmed || !note.trim() || uncertain || !record.canAppendNote || !careGrantIsActive(record.grant)) return;
        writing.current = true; setBusy(true); setError(null); setMessage(null); setReceipt(null);
        const grant = record.grant;
        const request = epoch.current;
        const response = await appendSharedCareNote(grant._id, note);
        writing.current = false; setBusy(false);
        if (request !== epoch.current) return;
        setConfirmed(false);
        if ("error" in response) {
            if (response.error.code === "FORBIDDEN") { epoch.current++; setRecord(null); setNote(""); setError("unavailable"); }
            else { setError("error"); setUncertain(true); }
            return;
        }
        setNote(""); setMessage("noteSaved");
        const verification = response.meta?.writeVerification ?? null;
        await open(grant, true);
        if (request + 1 === epoch.current) setReceipt(verification);
    };
    if (user?.role === "IPS") return <section className="mx-auto max-w-4xl space-y-4 p-6">
        <h1 className="text-2xl font-semibold">{text.title}</h1><p>{text.ownerInstructions}</p>
        <p>{text.rights}</p><p>{text.ownerPreserved}</p><Link to="/patients" className="inline-block rounded bg-blue-600 px-3 py-2 text-white">{text.ownPatients}</Link>
    </section>;
    if (user?.role !== "MEDECIN") return <p role="alert" className="p-6">{text.unavailable}</p>;
    return <section className="mx-auto max-w-5xl space-y-5 p-6">
        <header><h1 className="text-2xl font-semibold">{text.title}</h1><p>{text.description}</p></header>
        {error && <p role="alert">{text[error]}</p>}
        {message && <p role="status">{text[message]}</p>}
        <button type="button" disabled={loading || busy || !!note.trim()} className="rounded border px-3 py-2" onClick={() => void load()}>{text.refresh}</button>
        {loading && <p role="status">{text.loading}</p>}
        {!loading && !grants.length && <p>{text.empty}</p>}
        <ul className="space-y-2">{grants.map(grant => <li key={grant._id} className="flex flex-wrap items-center gap-3 rounded border bg-white p-3">
            <span translate="no">{grant.patient ? `${grant.patient.prenom} ${grant.patient.nom}` : grant.patientId}</span>
            <span>{grant.status === "REVOKED" ? text.statusRevoked : careGrantIsActive(grant) ? text.statusActive : text.statusExpired}</span>
            <span>{text.expires.replace("{date}", new Date(grant.expiresAt).toLocaleString(locale))}</span>
            <button type="button" disabled={loading || busy || !!note.trim() || !careGrantIsActive(grant)} className="rounded border px-3 py-1" onClick={() => void open(grant)}>{text.openRecord}</button>
        </li>)}</ul>
        {record && <section className="space-y-4 rounded border border-blue-200 bg-blue-50 p-4">
            <h2 className="text-lg font-semibold" translate="no">{text.patient.replace("{name}", `${record.patient.prenom} ${record.patient.nom}`)}</h2>
            <p>{text.rights}</p><p>{text.ownerPreserved}</p>
            <p>{text.expires.replace("{date}", new Date(record.grant.expiresAt).toLocaleString(locale))}</p>
            <button type="button" disabled={loading || busy} className="rounded border px-3 py-1" onClick={() => void open(record.grant, true)}>{text.refresh}</button>
            <h3 className="font-semibold">{text.profile}</h3><SharedCareProfile profile={record.profile} />
            <CareNoteList title={text.originalNotes} notes={record.originalNotes} truncated={record.notesTruncated} />
            <CareNoteList title={text.sharedNotes} notes={record.sharedNotes} truncated={record.notesTruncated} />
            {record.canAppendNote && <div className="space-y-3 border-t pt-4">
                <p>{text.draftHelp}</p>
                <label className="block">{text.noteLabel}<textarea className="mt-1 min-h-36 w-full rounded border p-3" maxLength={20000} value={note} disabled={busy} onChange={event => { setNote(event.target.value); setConfirmed(false); setMessage(null); }} /></label>
                <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} disabled={busy || !note.trim() || uncertain} onChange={event => setConfirmed(event.target.checked)} />{text.noteConsent}</label>
                <div className="flex flex-wrap gap-2"><button type="button" className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50" disabled={busy || !confirmed || !note.trim() || uncertain} onClick={() => void append()}>{text.appendNote}</button>
                <button type="button" className="rounded border px-3 py-2" disabled={busy || !note} onClick={() => { setNote(""); setConfirmed(false); }}>{text.discardDraft}</button></div>
            </div>}
            <WriteVerificationReceipt verification={receipt} labels={receiptLabels} />
        </section>}
    </section>;
}
