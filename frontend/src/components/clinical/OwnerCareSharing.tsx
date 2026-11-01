import { UI_LABELS_FR } from "../../i18n/uiLabels.fr";
import { useUiLabelTree } from "../../hooks/useUiLabels";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { HomeI18nContext } from "../../contexts/HomeI18nContext";
import { useAuth } from "../../hooks/useAuth";
import { clinicalCareAccessLabels } from "../../i18n/clinicalCareAccessLabels";
import { displaySpecialty } from "../../i18n/specialtyLabels";
import { listEligibleCareClinicians, listPatientCareGrants, createPatientCareGrant, revokePatientCareGrant,
    listPatientSharedCareNotes, careGrantIsActive, type CareClinician, type CareGrant, type CareNote } from "../../services/clinicalCareAccessApi";
import { WriteVerificationReceipt } from "../system/WriteVerificationReceipt";
import { CareNoteList } from "./CareNoteList";
import type { WriteVerificationMeta } from "../../types/api";

export type CareSharingPatient = { _id: string; nom: string; prenom: string; ownerUserId?: string | null; archivedAt?: string | null };
export function OwnerCareSharing({ patient, onClose }: { patient: CareSharingPatient | null; onClose: () => void }) {
    const { user } = useAuth();
    const { locale } = useContext(HomeI18nContext) || { locale: "fr" };
    const text = clinicalCareAccessLabels(locale);
    const receiptLabels = useUiLabelTree(UI_LABELS_FR.writeVerification);
    const authorized = user?.role === "IPS" && !!user.id && patient?.ownerUserId === user.id && !patient.archivedAt;
    const [clinicians, setClinicians] = useState<CareClinician[]>([]);
    const [grants, setGrants] = useState<CareGrant[]>([]);
    const [notes, setNotes] = useState<CareNote[]>([]);
    const [truncated, setTruncated] = useState(false);
    const [target, setTarget] = useState("");
    const [duration, setDuration] = useState<60 | 240 | 1440>(60);
    const [confirmed, setConfirmed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<"error" | "unavailable" | "alreadyActive" | null>(null);
    const [message, setMessage] = useState<"granted" | "revoked" | null>(null);
    const [receipt, setReceipt] = useState<WriteVerificationMeta | null>(null);
    const epoch = useRef(0);
    const writing = useRef(false);
    const load = useCallback(async () => {
        if (!authorized || !patient) return;
        const request = ++epoch.current;
        setLoading(true); setError(null); setConfirmed(false);
        setClinicians([]); setGrants([]); setNotes([]); setTruncated(false);
        const results = await Promise.all([listEligibleCareClinicians(), listPatientCareGrants(patient._id), listPatientSharedCareNotes(patient._id)]);
        if (request !== epoch.current) return;
        setLoading(false);
        const failure = results.find(result => "error" in result);
        if (failure && "error" in failure) { if (failure.error.code === "FORBIDDEN") setError("unavailable"); else setError("error"); return; }
        const [eligible, current, shared] = results;
        if (!("error" in eligible) && !("error" in current) && !("error" in shared)) {
            setClinicians(eligible.data); setGrants(current.data); setNotes(shared.data.sharedNotes); setTruncated(shared.data.notesTruncated);
        }
    }, [authorized, patient?._id]);
    useEffect(() => {
        setTarget(""); setDuration(60); setConfirmed(false); setError(null); setMessage(null); setReceipt(null);
        if (authorized) void load();
        else { setClinicians([]); setGrants([]); setNotes([]); }
        return () => { epoch.current++; };
    }, [load, authorized]);
    const selected = clinicians.find(clinician => clinician._id === target);
    if (!authorized || !patient) return null;
    const name = `${patient.prenom} ${patient.nom}`.trim();
    const grant = async () => {
        if (!confirmed || !selected || writing.current || loading) return;
        writing.current = true; setBusy(true); setError(null); setMessage(null); setReceipt(null);
        const request = epoch.current;
        const response = await createPatientCareGrant(patient._id, selected._id, duration);
        writing.current = false; setBusy(false);
        if (request !== epoch.current) return;
        setConfirmed(false);
        if ("error" in response) { if (response.error.code === "CARE_ACCESS_ALREADY_ACTIVE") setError("alreadyActive");
            else if (response.error.code === "FORBIDDEN") setError("unavailable");
            else setError("error"); return; }
        setMessage("granted"); setReceipt(response.meta?.writeVerification ?? null); await load();
    };
    const revoke = async (access: CareGrant) => {
        if (writing.current || !careGrantIsActive(access)) return;
        writing.current = true; setBusy(true); setError(null); setMessage(null); setReceipt(null);
        const request = epoch.current;
        const response = await revokePatientCareGrant(access._id);
        writing.current = false; setBusy(false);
        if (request !== epoch.current) return;
        if ("error" in response) { if (response.error.code === "FORBIDDEN") setError("unavailable"); else setError("error"); return; }
        setMessage("revoked"); setReceipt(response.meta?.writeVerification ?? null); await load();
    };
    return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="care-sharing-title">
        <section className="max-h-[90vh] w-full max-w-3xl space-y-4 overflow-auto rounded-lg bg-white p-5 shadow-lg">
            <div className="flex justify-between gap-4"><h2 id="care-sharing-title" className="text-lg font-semibold">{text.title}</h2><button type="button" disabled={busy} onClick={onClose}>{text.close}</button></div>
            <p className="font-semibold" translate="no">{text.patient.replace("{name}", name)}</p>
            <p>{text.rights}</p><p>{text.ownerPreserved}</p>
            {error && <p role="alert">{text[error]}</p>}
            {message && <p role="status">{text[message]}</p>}
            <WriteVerificationReceipt verification={receipt} labels={receiptLabels} />
            <button type="button" disabled={busy || loading} onClick={() => void load()}>{text.refresh}</button>
            {loading ? <p role="status">{text.loading}</p> : <>
                <label className="block">{text.target}<select className="ml-2 rounded border p-2" value={target} disabled={busy} onChange={event => { setTarget(event.target.value); setConfirmed(false); }}>
                    <option value="">{text.chooseTarget}</option>
                    {clinicians.map(clinician => <option key={clinician._id} value={clinician._id}>{clinician.professional.prenom} {clinician.professional.nom} — {displaySpecialty(clinician.professional.specialty, locale)} ({clinician.username})</option>)}
                </select></label>
                <label className="block">{text.duration}<select className="ml-2 rounded border p-2" value={duration} disabled={busy} onChange={event => { setDuration(Number(event.target.value) as 60 | 240 | 1440); setConfirmed(false); }}>
                    {[60, 240, 1440].map(minutes => <option key={minutes} value={minutes}>{minutes / 60} h</option>)}
                </select></label>
                {selected && <p>{text.grantReview.replace("{name}", `${selected.professional.prenom} ${selected.professional.nom} (${selected.username})`).replace("{hours}", String(duration / 60))}</p>}
                <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} disabled={busy || !selected} onChange={event => setConfirmed(event.target.checked)} />{text.grantConsent}</label>
                <button type="button" className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50" disabled={busy || !confirmed || !selected} onClick={() => void grant()}>{text.grant}</button>
                <section className="space-y-2"><h3 className="font-semibold">{text.activeTitle}</h3>
                    {!grants.length && <p>{text.empty}</p>}
                    {grants.map(access => <article key={access._id} className="flex flex-wrap items-center gap-3 rounded border p-3">
                        <span translate="no">{access.target?.username || access.targetUserId}</span>
                        <span>{access.status === "REVOKED" ? text.statusRevoked : careGrantIsActive(access) ? text.statusActive : text.statusExpired}</span>
                        <span>{text.expires.replace("{date}", new Date(access.expiresAt).toLocaleString(locale))}</span>
                        {careGrantIsActive(access) && <button type="button" className="rounded border px-3 py-1" disabled={busy} onClick={() => void revoke(access)}>{text.revoke}</button>}
                    </article>)}
                </section>
                <CareNoteList notes={notes} title={text.sharedNotes} truncated={truncated} />
            </>}
        </section>
    </div>;
}
