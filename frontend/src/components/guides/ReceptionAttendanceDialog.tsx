import { useEffect, useId, useRef, useState } from "react";
import { receptionAttendanceLabels } from "../../i18n/receptionAttendanceLabels";
import {
    fetchReceptionHistoricalAppointments,
    regularizeReceptionAttendance,
    type ReceptionAttendanceOutcome,
    type ReceptionHistoricalAppointment,
    type ReceptionPatient,
} from "../../services/receptionApi";

export type ReceptionAttendanceDialogProps = {
    patient: ReceptionPatient;
    clinicId: string;
    locale: string;
    onClose: () => void;
    onIdentityConfirmed: (patientId: string) => void;
    onUpdated: (patientId: string, bookingProof: string, hasUnresolved: boolean) => void;
    onLookupRequired: () => void;
};

type Choice = { appointment: ReceptionHistoricalAppointment; outcome: ReceptionAttendanceOutcome };

// A deterministic administrative dialog. Only the explicit confirmation performs
// a write; no effect chooses an attendance outcome or sends patient data to AI.
export function ReceptionAttendanceDialog(props: ReceptionAttendanceDialogProps) {
    const { patient, clinicId, locale } = props;
    const copy = receptionAttendanceLabels(locale);
    const titleId = useId();
    const descriptionId = useId();
    const dialog = useRef<HTMLDialogElement>(null);
    const identityButton = useRef<HTMLButtonElement>(null);
    const confirmButton = useRef<HTMLButtonElement>(null);
    const firstAppointment = useRef<HTMLLIElement>(null);
    const completionMessage = useRef<HTMLParagraphElement>(null);
    const refreshButton = useRef<HTMLButtonElement>(null);
    const callbacks = useRef(props);
    callbacks.current = props;
    const requestVersion = useRef(0);
    const pending = useRef(false);
    const writePending = useRef(false);
    const verifiedIdentity = useRef(false);
    const proof = useRef(patient.bookingProof ?? "");
    const [verified, setVerified] = useState(false);
    const [appointments, setAppointments] = useState<ReceptionHistoricalAppointment[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [busy, setBusy] = useState<"" | "loading" | "saving">("");
    const [choice, setChoice] = useState<Choice | null>(null);
    const [error, setError] = useState<"" | "loadError" | "saveError" | "lookupRequired">("");
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        requestVersion.current++;
        pending.current = false;
        writePending.current = false;
        verifiedIdentity.current = false;
        proof.current = patient.bookingProof ?? "";
        setVerified(false); setAppointments([]); setHasMore(false);
        setBusy(""); setChoice(null); setError(""); setSaved(false);
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const element = dialog.current;
        if (element && !element.open) element.showModal();
        identityButton.current?.focus();
        return () => {
            requestVersion.current++;
            if (element?.open) element.close();
            if (previousFocus?.isConnected) previousFocus.focus();
        };
        // The parent also keys by clinic/patient. Proof refreshes within the same
        // scope must not reset identity or restore an already consumed token.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clinicId, patient._id]);

    useEffect(() => { if (choice) confirmButton.current?.focus(); }, [choice]);

    useEffect(() => {
        // The identity/confirmation controls can disappear after an async reply.
        // Move to the resulting content, without overriding a choice or a write.
        if (!verified || busy || choice || error) return;
        if (appointments.length) firstAppointment.current?.focus();
        else if (!hasMore) completionMessage.current?.focus();
        else refreshButton.current?.focus();
    }, [verified, busy, choice, error, appointments, hasMore]);

    const appointmentLabel = (appointment: ReceptionHistoricalAppointment) => copy.appointment
        .replace("{date}", appointment.date).replace("{time}", appointment.time);

    async function loadAppointments() {
        if (!verifiedIdentity.current || pending.current) return;
        if (!proof.current) { setError("lookupRequired"); return; }
        pending.current = true;
        const version = ++requestVersion.current;
        setBusy("loading"); setError(""); setChoice(null); setSaved(false);
        const response = await fetchReceptionHistoricalAppointments({ clinic: clinicId, patientId: patient._id, bookingProof: proof.current });
        if (version !== requestVersion.current) return;
        pending.current = false;
        setBusy("");
        if ("error" in response) {
            setAppointments([]); setHasMore(false);
            setError(response.error.code === "RECEPTION_LOOKUP_REQUIRED" ? "lookupRequired" : "loadError");
            return;
        }
        const data = response.data;
        setAppointments(data.appointments); setHasMore(data.hasMore);
        callbacks.current.onUpdated(patient._id, proof.current, data.appointments.length > 0 || data.hasMore);
    }

    function verifyIdentity() {
        if (pending.current) return;
        verifiedIdentity.current = true;
        setVerified(true);
        callbacks.current.onIdentityConfirmed(patient._id);
        void loadAppointments();
    }

    async function saveChoice() {
        if (!choice || !verifiedIdentity.current || pending.current || error === "lookupRequired") return;
        if (!proof.current) { setError("lookupRequired"); return; }
        pending.current = true;
        const selected = choice;
        writePending.current = true;
        const version = ++requestVersion.current;
        setBusy("saving"); setError(""); setSaved(false);
        const response = await regularizeReceptionAttendance(selected.appointment._id, {
            clinic: clinicId, patientId: patient._id, bookingProof: proof.current, outcome: selected.outcome,
        });
        if (version !== requestVersion.current) return;
        pending.current = false;
        writePending.current = false;
        setBusy(""); setChoice(null);
        if ("error" in response) {
            // A stale list can never be used for an automatic write retry.
            setAppointments([]); setHasMore(false);
            setError(response.error.code === "RECEPTION_LOOKUP_REQUIRED" ? "lookupRequired" : "saveError");
            return;
        }
        if (!response.data.bookingProof) {
            setAppointments([]); setHasMore(false); setError("lookupRequired");
            return;
        }
        proof.current = response.data.bookingProof;
        const remaining = appointments.filter(item => item._id !== selected.appointment._id);
        setAppointments(remaining); setSaved(true);
        callbacks.current.onUpdated(patient._id, proof.current, remaining.length > 0 || hasMore);
    }

    const allResolved = verified && !busy && !error && appointments.length === 0 && !hasMore;
    const close = () => { if (!writePending.current) callbacks.current.onClose(); };

    return <dialog ref={dialog} aria-labelledby={titleId} aria-describedby={descriptionId}
        dir={locale.toLowerCase().startsWith("he") ? "rtl" : "ltr"}
        onCancel={event => { event.preventDefault(); close(); }}
        onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); close(); } }}
        className="m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/40">
        <header className="border-b border-slate-200 p-5">
            <h2 id={titleId} className="text-xl font-semibold">{copy.title}</h2>
            <p className="mt-1 font-medium">{patient.prenom} {patient.nom}</p>
            <p id={descriptionId} className="mt-2 text-sm text-slate-600">{copy.description}</p>
        </header>
        <div className="space-y-4 p-5">
            {!verified && <>
                <p>{copy.identityPrompt}</p>
                <button ref={identityButton} type="button" onClick={verifyIdentity} disabled={Boolean(busy)} className="rounded bg-blue-600 px-3 py-2 font-medium text-white disabled:opacity-50">{copy.verifyIdentity}</button>
            </>}
            {busy === "loading" && <p role="status">{copy.loading}</p>}
            {error && <div className="space-y-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <p role="alert">{copy[error]}</p>
                {error === "lookupRequired" && <button type="button" onClick={() => callbacks.current.onLookupRequired()} className="rounded border border-red-300 bg-white px-3 py-2 font-medium">{copy.searchAgain}</button>}
            </div>}
            {saved && <p role="status" className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{copy.saved}</p>}
            {allResolved && <p ref={completionMessage} tabIndex={-1} role="status">{copy.allResolved}</p>}
            {verified && appointments.length > 0 && <ul className="space-y-3">
                {appointments.map((appointment, index) => <li key={appointment._id} ref={index === 0 ? firstAppointment : undefined} tabIndex={-1} className="space-y-3 rounded border border-slate-200 p-3 focus:outline focus:outline-2 focus:outline-blue-500">
                    <h3 className="font-semibold"><time dateTime={`${appointment.date}T${appointment.time}`}>{appointmentLabel(appointment)}</time></h3>
                    <p className="text-sm">{copy.question}</p>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={Boolean(busy)} onClick={() => { setChoice({ appointment, outcome: "attended" }); setSaved(false); }} className="rounded border border-blue-600 px-3 py-2 text-sm font-medium text-blue-800 disabled:opacity-50">{copy.attended}</button>
                        <button type="button" disabled={Boolean(busy)} onClick={() => { setChoice({ appointment, outcome: "not_attended" }); setSaved(false); }} className="rounded border border-slate-400 px-3 py-2 text-sm font-medium disabled:opacity-50">{copy.notAttended}</button>
                    </div>
                </li>)}
            </ul>}
            {choice && <section aria-label={appointmentLabel(choice.appointment)} className="space-y-3 rounded border border-blue-300 bg-blue-50 p-4">
                <p className="font-medium">{appointmentLabel(choice.appointment)}</p>
                <p>{choice.outcome === "attended" ? copy.confirmAttended : copy.confirmNotAttended}</p>
                <div className="flex flex-wrap gap-2">
                    <button ref={confirmButton} type="button" disabled={Boolean(busy)} onClick={() => void saveChoice()} className="rounded bg-blue-600 px-3 py-2 font-medium text-white disabled:opacity-50">{busy === "saving" ? copy.saving : copy.confirm}</button>
                    <button type="button" disabled={Boolean(busy)} onClick={() => setChoice(null)} className="rounded border border-slate-300 bg-white px-3 py-2 font-medium disabled:opacity-50">{copy.cancel}</button>
                </div>
            </section>}
            {verified && !choice && error !== "lookupRequired" && <>
                {hasMore && <p className="text-sm text-slate-600">{copy.more}</p>}
                {!allResolved && <button ref={refreshButton} type="button" disabled={Boolean(busy)} onClick={() => void loadAppointments()} className="rounded border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50">{copy.refresh}</button>}
            </>}
        </div>
        <footer className="border-t border-slate-200 p-5">
            <button type="button" disabled={busy === "saving"} onClick={close} className="rounded border border-slate-300 px-3 py-2 font-medium disabled:opacity-50">{allResolved ? copy.close : copy.postpone}</button>
        </footer>
    </dialog>;
}
