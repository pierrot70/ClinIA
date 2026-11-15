import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CareNoteList } from "../components/clinical/CareNoteList";
import { SharedCareProfile } from "../components/clinical/SharedCareProfile";
import { UiMessage } from "../components/i18n/UiMessage";
import { useAuth } from "../hooks/useAuth";
import { useUiLabels, useUiLabelTree } from "../hooks/useUiLabels";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import {
    cancelCareTransfer, decideCareTransfer, getCareTransferContext, listCareTransfers, readCareTransferRecord,
    requestCareTransfer, type CareTransfer, type CareTransferContext, type CareTransferRecord,
} from "../services/clinicalCareAccessApi";

const labels = UI_LABELS_FR.patientCareTransfer;
const buttonClass = "rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium disabled:opacity-50";
const actionClass = "rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
const isPending = (transfer: CareTransfer) => transfer.status === "PENDING" && Date.parse(transfer.expiresAt) > Date.now();
const patientName = (patient: CareTransferContext["patient"]) => [patient.prenom, patient.nom].filter(Boolean).join(" ");

const messages = { send: "sent", accept: "accepted", decline: "declined", cancel: "cancelled" } as const;
type TransferAction = keyof typeof messages;
function transferErrorSource(code: string) {
    switch (code) {
        case "TRANSFER_ALREADY_PENDING": return labels.alreadyPending;
        case "TRANSFER_PATIENT_CONFLICT": return labels.conflict;
        case "TRANSFER_CONSENT_REQUIRED": return labels.consentRequired;
        case "FORBIDDEN": return UI_LABELS_FR.clinicalCareAccess.unavailable;
        default: return UI_LABELS_FR.clinicalCareAccess.error;
    }
}

export function PatientCareTransferPage() {
    const { user } = useAuth();
    const { state } = useLocation();
    const patientId = user?.role === "IPS" && typeof state?.patientId === "string" ? state.patientId : null;
    if (user?.role !== "IPS" && user?.role !== "MEDECIN") return null;
    return <CareTransfers key={user.id + ":" + (patientId ?? "")} sender={user.role === "IPS"} patientId={patientId} />;
}

function CareTransfers({ sender, patientId }: { sender: boolean; patientId: string | null }) {
    const text = useUiLabelTree(labels);
    const shared = useUiLabelTree(UI_LABELS_FR.clinicalCareAccess);
    const { locale } = useUiLabels();
    const [transfers, setTransfers] = useState<CareTransfer[]>([]);
    const [context, setContext] = useState<CareTransferContext | null>(null);
    const [record, setRecord] = useState<CareTransferRecord | null>(null);
    const [target, setTarget] = useState("");
    const [consent, setConsent] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<(typeof messages)[TransferAction] | null>(null);
    const epoch = useRef(0);
    const writing = useRef(false);

    const load = useCallback(async () => {
        const request = ++epoch.current;
        setLoading(true);
        setError(null);
        setRecord(null);
        const [list, candidate] = await Promise.all([
            listCareTransfers(),
            patientId ? getCareTransferContext(patientId) : null,
        ]);
        if (request !== epoch.current) return;
        setLoading(false);
        if ("error" in list) setError(transferErrorSource(list.error.code));
        else setTransfers(list.data);
        if (candidate && "error" in candidate) {
            setContext(null);
            setError(transferErrorSource(candidate.error.code));
        }
        else if (candidate) setContext(candidate.data);
    }, [patientId]);

    useEffect(() => {
        void load();
        return () => { epoch.current++; };
    }, [load]);

    useEffect(() => {
        if (record?.transfer.status !== "PENDING") return;
        const timer = setTimeout(() => {
            setRecord(null);
            setError(UI_LABELS_FR.clinicalCareAccess.unavailable);
        }, Math.max(0, Date.parse(record.transfer.expiresAt) - Date.now()));
        return () => clearTimeout(timer);
    }, [record]);

    const open = async (transfer: CareTransfer) => {
        const request = ++epoch.current;
        setRecord(null);
        setLoading(true);
        setError(null);
        setMessage(null);
        const response = await readCareTransferRecord(transfer._id);
        if (request !== epoch.current) return;
        setLoading(false);
        if ("error" in response) setError(transferErrorSource(response.error.code));
        else if (response.data.transfer.status === "ACCEPTED" || isPending(response.data.transfer)) setRecord(response.data);
        else setError(UI_LABELS_FR.clinicalCareAccess.unavailable);
    };

    const submit = async (action: TransferAction, transfer?: CareTransfer) => {
        if (writing.current || loading) return;
        if (action === "send" ? !context || !target || !consent : !transfer || !isPending(transfer)) return;
        writing.current = true;
        const request = ++epoch.current;
        setBusy(true);
        setError(null);
        setMessage(null);
        const response = action === "send" ? await requestCareTransfer(context!.patient._id, target, consent)
            : action === "cancel" ? await cancelCareTransfer(transfer!._id)
                : await decideCareTransfer(transfer!._id, action);
        writing.current = false;
        if (request !== epoch.current) return;
        setBusy(false);
        if ("error" in response) {
            const failure = transferErrorSource(response.error.code);
            if (failure === UI_LABELS_FR.clinicalCareAccess.unavailable || failure === UI_LABELS_FR.clinicalCareAccess.error) setRecord(null);
            setError(failure);
            return;
        }
        setTarget("");
        setConsent(false);
        setMessage(messages[action]);
        await load();
    };

    const pendingForPatient = transfers.some(transfer => transfer.patientId === context?.patient._id && isPending(transfer));
    return <section className="mx-auto max-w-5xl space-y-5 p-6">
        <header className="space-y-2">
            <h1 className="text-2xl font-semibold">{text.title}</h1>
            <p>{sender ? text.ipsInstructions : text.doctorInstructions}</p>
            {sender && <Link to="/patients" className="text-blue-700 underline">{shared.ownPatients}</Link>}
        </header>
        {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">
            <UiMessage message={error} />
        </p>}
        {message && <p role="status" className="rounded bg-green-50 p-3 text-green-900">{text[message]}</p>}
        {message === "accepted" && <Link to="/patients" className="text-blue-700 underline">{shared.ownPatients}</Link>}
        <button type="button" className={buttonClass} disabled={loading || busy} onClick={() => void load()}>{shared.refresh}</button>
        {loading && <p role="status">{shared.loading}</p>}
        {sender && context && <section className="space-y-3 rounded border bg-white p-4">
            <h2 className="text-lg font-semibold">{text.sendHeading}</h2>
            <p className="font-semibold" translate="no">{patientName(context.patient)}</p>
            <p>{text.terms}</p>
            {pendingForPatient ? <p>{text.alreadyPending}</p> : !context.clinicians.length ? <p>{text.noPhysicians}</p> :
                <form className="space-y-3" onSubmit={event => { event.preventDefault(); void submit("send"); }}>
                    <label className="block">{text.choosePhysician}
                        <select className="ml-2 rounded border p-2" value={target} disabled={busy || loading} onChange={event => {
                            setTarget(event.target.value);
                            setConsent(false);
                        }}>
                            <option value="">{text.selectPhysician}</option>
                            {context.clinicians.map(clinician => <option key={clinician._id} value={clinician._id}>
                                {clinician.prenom} {clinician.nom} ({clinician.username})
                            </option>)}
                        </select>
                    </label>
                    <label className="flex items-start gap-2"><input type="checkbox" checked={consent} disabled={!target || busy || loading}
                        onChange={event => setConsent(event.target.checked)} />{text.consent}</label>
                    <button type="submit" className={actionClass} disabled={!target || !consent || busy || loading}>{text.send}</button>
                </form>}
        </section>}
        <section className="space-y-3">
            <h2 className="text-lg font-semibold">{sender ? text.outgoing : text.incoming}</h2>
            {!loading && !transfers.length && <p>{text.empty}</p>}
            <ul className="space-y-2">
                {transfers.map(transfer => {
                    const pending = isPending(transfer);
                    const status = transfer.status === "PENDING" && !pending ? "EXPIRED" : transfer.status;
                    return <li key={transfer._id} className="flex flex-wrap items-center gap-3 rounded border bg-white p-3">
                        <span className="font-semibold" translate="no">{transfer.patient ? patientName(transfer.patient) : text.hiddenPatient}</span>
                        {transfer.professional && <span translate="no">{transfer.professional}</span>}
                        <span>{text.status[status]}</span>
                        <span>{new Date(transfer.createdAt).toLocaleString(locale)}</span>
                        {pending && <span>{shared.expires.replace("{date}", new Date(transfer.expiresAt).toLocaleString(locale))}</span>}
                        {sender && pending && <button type="button" className={buttonClass} disabled={busy || loading}
                            onClick={() => void submit("cancel", transfer)}>{text.cancel}</button>}
                        {!sender && (pending || status === "ACCEPTED") && <button type="button" className={buttonClass} disabled={busy || loading}
                            onClick={() => void open(transfer)}>{pending ? text.open : text.openAccepted}</button>}
                    </li>;
                })}
            </ul>
        </section>
        {record && <section className="space-y-4 rounded border border-blue-200 bg-blue-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold" translate="no">{patientName(record.patient)}</h2>
                <button type="button" className={buttonClass} disabled={busy} onClick={() => setRecord(null)}>{text.closeRecord}</button>
            </div>
            {isPending(record.transfer) && <>
                <p>{text.review}</p>
                <p>{shared.expires.replace("{date}", new Date(record.transfer.expiresAt).toLocaleString(locale))}</p>
            </>}
            <h3 className="font-semibold">{shared.profile}</h3>
            <SharedCareProfile profile={record.profile} />
            <CareNoteList title={shared.originalNotes} notes={record.originalNotes} truncated={record.notesTruncated} />
            <CareNoteList title={shared.sharedNotes} notes={record.sharedNotes} truncated={record.notesTruncated} />
            {isPending(record.transfer) && <div className="flex flex-wrap gap-2">
                <button type="button" className={actionClass} disabled={busy} onClick={() => void submit("accept", record.transfer)}>{text.accept}</button>
                <button type="button" className={buttonClass} disabled={busy} onClick={() => void submit("decline", record.transfer)}>{text.decline}</button>
            </div>}
        </section>}
    </section>;
}
