import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CareNoteList } from "../components/clinical/CareNoteList";
import { SharedCareProfile } from "../components/clinical/SharedCareProfile";
import { UiMessage } from "../components/i18n/UiMessage";
import { useCareTransferMode } from "../hooks/useCareTransferMode";
import { useAuth } from "../hooks/useAuth";
import { useUiLabels, useUiLabelTree } from "../hooks/useUiLabels";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import {
    cancelCareTransfer, decideCareTransfer, extendGeneralCareTransfer, getCareTransferContext, listCareTransfers, readCareTransferRecord,
    requestCareTransfer, requestGeneralCareTransfer, setCareTransferPreference, type CareTransfer, type CareTransferContext, type CareTransferRecord,
} from "../services/clinicalCareAccessApi";

const labels = UI_LABELS_FR.patientCareTransfer;
const buttonClass = "rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium disabled:opacity-50";
const actionClass = "rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
const isPending = (transfer: CareTransfer) => transfer.status === "PENDING"
    && (transfer.kind === "GENERAL" || (transfer.expiresAt !== null && Date.parse(transfer.expiresAt) > Date.now()));
const patientName = (patient: CareTransferContext["patient"]) => [patient.prenom, patient.nom].filter(Boolean).join(" ");

const messages = { general: "sent", extend: "extended", send: "sent", accept: "accepted", decline: "declined", cancel: "cancelled" } as const;
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
    const { mode, acceptsNewPatients } = useCareTransferMode(user);
    const shared = useUiLabelTree(UI_LABELS_FR.clinicalCareAccess);
    const patientId = mode === "sender" && typeof state?.patientId === "string" ? state.patientId : null;
    if (user?.role !== "IPS" && user?.role !== "MEDECIN") return null;
    if (mode === "loading") return <p role="status" className="p-6">{shared.loading}</p>;
    if (mode === "unavailable") return <p role="alert" className="p-6">{shared.unavailable}</p>;
    return <CareTransfers key={user.id + ":" + mode + ":" + (patientId ?? "")} sender={mode === "sender"} patientId={patientId}
        initialPreference={acceptsNewPatients} />;
}

function CareTransfers({ sender, patientId, initialPreference }: { sender: boolean; patientId: string | null; initialPreference: boolean | null }) {
    const text = useUiLabelTree(labels);
    const shared = useUiLabelTree(UI_LABELS_FR.clinicalCareAccess);
    const { locale, t } = useUiLabels();
    const [transfers, setTransfers] = useState<CareTransfer[]>([]);
    const [context, setContext] = useState<CareTransferContext | null>(null);
    const [record, setRecord] = useState<CareTransferRecord | null>(null);
    const [target, setTarget] = useState("");
    const [consent, setConsent] = useState(false);
    const [allLocal, setAllLocal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<(typeof messages)[TransferAction] | null>(null);
    const [acceptsNewPatients, setAcceptsNewPatients] = useState(initialPreference);
    const epoch = useRef(0);
    const writing = useRef(false);
    const selectedClinic = useRef<string | undefined>(undefined);

    const savePreference = async (value: boolean) => {
        if (writing.current) return;
        writing.current = true;
        setBusy(true);
        setError(null);
        setMessage(null);
        const result = await setCareTransferPreference(value);
        if ("error" in result) setError(transferErrorSource(result.error.code));
        else setAcceptsNewPatients(result.data.acceptsNewPatients);
        writing.current = false;
        setBusy(false);
    };

    const load = useCallback(async (notice: string | null = null) => {
        const request = ++epoch.current;
        setLoading(true);
        setError(notice);
        setAllLocal(false);
        setTarget("");
        setConsent(false);
        setRecord(null);
        const [list, candidate] = await Promise.all([
            listCareTransfers(),
            patientId ? getCareTransferContext(patientId, selectedClinic.current) : null,
        ]);
        if (request !== epoch.current) return;
        setLoading(false);
        if ("error" in list) setError(transferErrorSource(list.error.code));
        else setTransfers(list.data);
        if (candidate && "error" in candidate) {
            selectedClinic.current = undefined;
            setContext(null);
            setError(transferErrorSource(candidate.error.code));
        }
        else if (candidate) {
            selectedClinic.current = candidate.data.clinicId ?? undefined;
            setContext(candidate.data);
        }
    }, [patientId]);

    useEffect(() => {
        void load();
        return () => { epoch.current++; };
    }, [load]);

    useEffect(() => {
        if (loading || busy) return;
        let current = true;
        const refreshList = async () => {
            const request = epoch.current;
            const result = await listCareTransfers();
            if (current && epoch.current === request && "data" in result) setTransfers(result.data);
        };
        const onVisible = () => { if (document.visibilityState === "visible") void refreshList(); };
        document.addEventListener("visibilitychange", onVisible);
        const deadlines = transfers.filter(transfer => sender && transfer.kind === "GENERAL" && transfer.status === "PENDING"
            && !transfer.reminderDue && transfer.reminderAt).map(transfer => Date.parse(transfer.reminderAt!));
        const timer = deadlines.length ? setTimeout(() => void refreshList(), Math.max(1000, Math.min(...deadlines) - Date.now() + 100)) : null;
        return () => {
            current = false;
            document.removeEventListener("visibilitychange", onVisible);
            if (timer !== null) clearTimeout(timer);
        };
    }, [loading, busy, sender, transfers]);

    useEffect(() => {
        if (record?.transfer.status !== "PENDING" || !record.transfer.expiresAt) return;
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

    const submit = async (action: TransferAction, write: () => ReturnType<typeof requestCareTransfer>, transfer?: CareTransfer) => {
        if (writing.current || loading) return;
        writing.current = true;
        const request = ++epoch.current;
        setBusy(true);
        setError(null);
        setMessage(null);
        const response = await write();
        writing.current = false;
        if (request !== epoch.current) return;
        setBusy(false);
        if ("error" in response) {
            if ((action === "send" || action === "general") &&
                (response.error.code === "TRANSFER_CLINIC_REQUIRED" || response.error.code === "FORBIDDEN")) {
                selectedClinic.current = undefined;
                await load(UI_LABELS_FR.clinicalCareAccess.unavailable);
                return;
            }
            if (action === "send" && response.error.code === "TRANSFER_RECIPIENT_UNAVAILABLE") {
                await load(labels.recipientUnavailable);
                return;
            }
            if (action === "extend" && response.error.code === "TRANSFER_EXTENSION_UNAVAILABLE") {
                await load(labels.extensionChanged);
                return;
            }
            if (transfer?.kind === "GENERAL" && response.error.code === "FORBIDDEN") {
                await load(labels.generalUnavailable);
                return;
            }
            if (response.error.code === "TRANSFER_ALREADY_PENDING") {
                await load(labels.alreadyPending);
                return;
            }
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

    const general = allLocal || context?.clinicians.length === 0;
    const clinicName = context?.clinics.find(clinic => clinic._id === context.clinicId)?.nom;

    const chooseGeneral = (value: boolean) => {
        setAllLocal(value);
        setTarget("");
        setConsent(false);
    };

    const send = () => {
        const clinicId = context?.clinicId;
        if (!context || !clinicId || !consent) return;
        if (general) return submit("general", () => requestGeneralCareTransfer(context.patient._id, consent, clinicId));
        if (context.clinicians.some(clinician => clinician._id === target)) {
            return submit("send", () => requestCareTransfer(context.patient._id, target, consent, clinicId));
        }
    };

    const resolve = (action: "accept" | "decline" | "cancel", transfer: CareTransfer) => {
        if (!isPending(transfer)) return;
        return submit(action, () => action === "cancel" ? cancelCareTransfer(transfer._id) : decideCareTransfer(transfer._id, action), transfer);
    };

    const pendingForPatient = transfers.some(transfer => transfer.patientId === context?.patient._id && isPending(transfer));
    return <section className="mx-auto max-w-5xl space-y-5 p-6">
        <header className="space-y-2">
            <h1 className="text-2xl font-semibold">{text.title}</h1>
            <p>{sender ? text.ipsInstructions : text.doctorInstructions}</p>
            {!sender && acceptsNewPatients !== null && <label className="flex items-center gap-2">
                <input type="checkbox" checked={acceptsNewPatients} disabled={busy || loading}
                    onChange={event => void savePreference(event.target.checked)} />
                {text.acceptsNewPatients}
            </label>}
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
            {!pendingForPatient && context.clinics.length > 1 && <label className="block">{text.currentClinic}
                <select className="ml-2 rounded border p-2" value={context.clinicId ?? ""} disabled={loading || busy}
                    onChange={event => {
                        selectedClinic.current = event.target.value || undefined;
                        setMessage(null);
                        void load();
                    }}>
                    <option value="">{t(UI_LABELS_FR.walkInArrival.chooseClinic)}</option>
                    {context.clinics.map(clinic => <option key={clinic._id} value={clinic._id}>{clinic.nom}</option>)}
                </select>
            </label>}
            {!pendingForPatient && context.clinics.length === 1 && <p>{text.currentClinic} · <strong translate="no">{context.clinics[0].nom}</strong></p>}
            {!pendingForPatient && context.clinics.length === 0 && <p>{text.noClinic}</p>}
            {pendingForPatient && <p>{text.alreadyPending}</p>}
            {!pendingForPatient && context.clinicId &&
                <form className="space-y-3" onSubmit={event => { event.preventDefault(); void send(); }}>
                    {context.clinicians.length ? <div className="flex flex-wrap gap-4">
                        <label><input type="radio" name="audience" checked={!general} disabled={busy || loading}
                            onChange={() => chooseGeneral(false)} /> {text.directMode}</label>
                        <label><input type="radio" name="audience" checked={general} disabled={busy || loading}
                            onChange={() => chooseGeneral(true)} /> {text.localMode}</label>
                    </div> : <p>{text.noPhysicians}</p>}
                    {!general && <p>{text.terms}</p>}
                    {!general && <label className="block">{text.choosePhysician}
                        <select className="ml-2 rounded border p-2" value={target} disabled={busy || loading} onChange={event => {
                            setTarget(event.target.value);
                            setConsent(false);
                        }}>
                            <option value="">{text.selectPhysician}</option>
                            {context.clinicians.map(clinician => <option key={clinician._id} value={clinician._id}>
                                {clinician.prenom} {clinician.nom} ({clinician.username})
                            </option>)}
                        </select>
                    </label>}
                    <label className="flex items-start gap-2"><input type="checkbox" checked={consent} disabled={(!general && !target) || busy || loading}
                        onChange={event => setConsent(event.target.checked)} />{general ? text.generalConsent.replace("{clinic}", () => clinicName ?? "") : text.consent}</label>
                    <button type="submit" className={actionClass} disabled={!consent || busy || loading}>{general ? text.sendGeneral : text.send}</button>
                </form>}
        </section>}
        <section className="space-y-3">
            <h2 className="text-lg font-semibold">{sender ? text.outgoing : text.incoming}</h2>
            {!loading && !transfers.length && <p>{text.empty}</p>}
            <ul className="space-y-2">
                {transfers.map(transfer => {
                    const pending = isPending(transfer);
                    const anonymous = !sender && transfer.kind === "GENERAL" && pending;
                    const status = transfer.status === "PENDING" && !pending ? "EXPIRED" : transfer.status;
                    return <li key={transfer._id} className="flex flex-wrap items-center gap-3 rounded border bg-white p-3">
                        {transfer.kind === "GENERAL" && <strong>{text.generalInvitation}</strong>}
                        {!anonymous && <span className="font-semibold" translate="no">{transfer.patient ? patientName(transfer.patient) : text.hiddenPatient}</span>}
                        {!anonymous && transfer.professional && <span translate="no">{transfer.professional}</span>}
                        <span>{text.status[status]}</span>
                        <span>{new Date(transfer.createdAt).toLocaleString(locale)}</span>
                        {pending && transfer.expiresAt && <span>{shared.expires.replace("{date}", new Date(transfer.expiresAt).toLocaleString(locale))}</span>}
                        {sender && pending && transfer.kind === "GENERAL" && transfer.reminderDue && <p role="status">{text.generalOverdue}</p>}
                        {sender && transfer.kind === "GENERAL" && <GeneralCallScope key={transfer.nextClinic?._id ?? transfer._id}
                            transfer={transfer} disabled={busy || loading} onExtend={clinicId =>
                                submit("extend", () => extendGeneralCareTransfer(transfer._id, clinicId, true), transfer)} />}
                        {anonymous && <div className="space-y-2">
                            <p>{text.generalTerms}</p>
                            <button type="button" className={actionClass} disabled={busy || loading}
                                onClick={() => void resolve("accept", transfer)}>{text.acceptGeneral}</button>
                        </div>}
                        {sender && pending && <button type="button" className={buttonClass} disabled={busy || loading}
                            onClick={() => void resolve("cancel", transfer)}>{text.cancel}</button>}
                        {!sender && !anonymous && (pending || status === "ACCEPTED") && <button type="button" className={buttonClass} disabled={busy || loading}
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
            {isPending(record.transfer) && record.transfer.expiresAt && <>
                <p>{text.review}</p>
                <p>{shared.expires.replace("{date}", new Date(record.transfer.expiresAt).toLocaleString(locale))}</p>
            </>}
            <h3 className="font-semibold">{shared.profile}</h3>
            <SharedCareProfile profile={record.profile} />
            <CareNoteList title={shared.originalNotes} notes={record.originalNotes} truncated={record.notesTruncated} />
            <CareNoteList title={shared.sharedNotes} notes={record.sharedNotes} truncated={record.notesTruncated} />
            {isPending(record.transfer) && <div className="flex flex-wrap gap-2">
                <button type="button" className={actionClass} disabled={busy} onClick={() => void resolve("accept", record.transfer)}>{text.accept}</button>
                <button type="button" className={buttonClass} disabled={busy} onClick={() => void resolve("decline", record.transfer)}>{text.decline}</button>
            </div>}
        </section>}
    </section>;
}

function GeneralCallScope({ transfer, disabled, onExtend }: {
    transfer: CareTransfer; disabled: boolean; onExtend: (clinicId: string) => void;
}) {
    const text = useUiLabelTree(labels);
    const [consent, setConsent] = useState(false);
    const clinics = transfer.contactedClinics ?? [];
    const next = transfer.nextClinic;
    const pending = isPending(transfer);
    if (!clinics.length) return pending ? <p>{text.legacyScope}</p> : null;

    const atLimit = transfer.maxClinics !== undefined && clinics.length >= transfer.maxClinics;
    return <div className="w-full space-y-2">
        <p>{text.contactedClinics} · <span translate="no">{clinics.map(clinic => clinic.nom).join(", ")}</span></p>
        {atLimit && <p>{text.clinicLimit.replace("{count}", String(transfer.maxClinics))}</p>}
        {pending && !atLimit && (next ? <div className="space-y-2">
            <p>{text.extensionHint}</p>
            <label className="flex items-start gap-2">
                <input type="checkbox" checked={consent} disabled={disabled} onChange={event => setConsent(event.target.checked)} />
                {text.extensionConsent.replace("{clinic}", () => next.nom)}
            </label>
            <button type="button" className={actionClass} disabled={disabled || !consent} onClick={() => {
                if (!consent) return;
                setConsent(false);
                onExtend(next._id);
            }}>{text.extend}</button>
        </div> : <p>{text.noNeighbor}</p>)}
    </div>;
}
