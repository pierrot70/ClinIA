import React, { useEffect, useRef, useState } from "react";
import { useHomeI18n } from "../contexts/HomeI18nContext";
import { consultationLabels } from "../i18n/consultationLabels";
import { consultationRequest, type ConsultationSummary, type ConsultationDetail } from "../services/consultationApi";

export function ConsultationsPage() {
    const { locale } = useHomeI18n();
    const t = consultationLabels(locale);
    const [items, setItems] = useState<ConsultationSummary[]>([]);
    const [detail, setDetail] = useState<ConsultationDetail | null>(null);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<"error" | "saved" | null>(null);
    const requestVersion = useRef(0);

    async function refresh() {
        const version = ++requestVersion.current;
        setBusy(true); setDetail(null); setNote(""); setMessage(null);
        try {
            const data = await consultationRequest<ConsultationSummary[]>();
            if (version === requestVersion.current) setItems(data);
        } catch { if (version === requestVersion.current) { setItems([]); setMessage("error"); } }
        finally { if (version === requestVersion.current) setBusy(false); }
    }
    useEffect(() => { void refresh(); return () => { requestVersion.current++; }; }, []);

    async function open(id: string) {
        const version = ++requestVersion.current;
        setBusy(true); setDetail(null); setNote(""); setMessage(null);
        try {
            const data = await consultationRequest<ConsultationDetail>(`/${id}`);
            if (version === requestVersion.current) setDetail(data);
        } catch { if (version === requestVersion.current) setMessage("error"); }
        finally { if (version === requestVersion.current) setBusy(false); }
    }
    async function save(accept = false) {
        if (!detail || busy) return;
        if (accept && !window.confirm(t.confirm)) return;
        const id = detail.appointment._id;
        setBusy(true); setMessage(null);
        try {
            await consultationRequest(`/${id}/${accept ? "accept-care" : "notes"}`, accept ? {} : { note });
            setNote("");
            // Clear old history before rechecking authorization.
            setDetail(null);
            const data = await consultationRequest<ConsultationDetail>(`/${id}`);
            setDetail(data); setMessage("saved");
        } catch { setDetail(null); setMessage("error"); }
        finally { setBusy(false); }
    }
    const button = "rounded border border-blue-700 px-3 py-2 text-blue-900 disabled:opacity-50";
    return <section className="mx-auto max-w-5xl space-y-4 p-6" dir={locale === "he" ? "rtl" : "ltr"}>
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <p>{t.description}</p>
        <button className={button} disabled={busy} onClick={() => void refresh()}>{t.refresh}</button>
        {busy && <p role="status">{t.loading}</p>}
        {message && <p role={message === "error" ? "alert" : "status"}>{t[message]}</p>}
        {!busy && items.length === 0 && <p>{t.empty}</p>}
        <ul className="max-h-64 overflow-auto rounded bg-white p-4">
            {items.map(item => <li key={item._id} className="flex items-center justify-between border-b py-2">
                <span dir="ltr" translate="no">{item.date.slice(0, 10)} {item.time} — {item.patient?.prenom} {item.patient?.nom}</span>
                <button disabled={busy} className={button} onClick={() => void open(item._id)}>{t.open}</button>
            </li>)}
        </ul>
        {detail && <div className="space-y-4 rounded bg-white p-5">
            <h2 className="text-xl" translate="no">{detail.patient.prenom} {detail.patient.nom}</h2>
            {detail.inCare && <p>{t.accepted}</p>}
            {detail.canAcceptCare && <button disabled={busy} className={button} onClick={() => void save(true)}>{t.accept}</button>}
            <h3 className="font-semibold">{t.history}</h3>
            {!detail.fullHistory && <p>{t.ownOnly}</p>}
            {detail.legacyNote && <article className="border p-3">
                <h4>{t.legacy}</h4>
                <p className="whitespace-pre-wrap" lang="en" dir="ltr" translate="no">{detail.legacyNote}</p>
            </article>}
            {detail.notes.map(entry => <article key={entry._id} className="border p-3">
                <p className="text-xs">{t.author}: <span translate="no">{entry.author}</span> — {entry.createdAt}</p>
                <p className="whitespace-pre-wrap" lang="en" dir="ltr" translate="no">{entry.note}</p>
            </article>)}
            {detail.canAddNote && <form onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-3">
                <label className="block" htmlFor="consultation-note">{t.add}</label>
                <p id="consultation-note-help" className="text-sm">{t.noteHelp}</p>
                <textarea id="consultation-note" aria-describedby="consultation-note-help" className="min-h-40 w-full rounded border p-3" lang="en" dir="ltr" translate="no" maxLength={20000} required disabled={busy} value={note} onChange={e => setNote(e.target.value)} />
                <button className={button} disabled={busy || !note.trim()}>{t.save}</button>
            </form>}
        </div>}
    </section>;
}
