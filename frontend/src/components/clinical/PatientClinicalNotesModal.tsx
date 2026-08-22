import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Save, X } from "lucide-react";
import { labels } from "../../i18n/uiLabels";
import { WriteVerificationReceipt } from "../system/WriteVerificationReceipt";
import { updatePatient, type Patient } from "../../services/patientsApi";
import type { WriteVerificationMeta } from "../../types/api";
import { ClinicalNoteHistory } from "./ClinicalNoteHistory";

type PatientClinicalNotesModalProps = {
    patient: Patient | null;
    onClose: () => void;
    onSaved: (patient: Patient) => void;
};

function withTimestampedEntry(note: string) {
    const timestamp = new Intl.DateTimeFormat("fr-CA", {
        dateStyle: "long",
        timeStyle: "short",
    }).format(new Date());
    const previousNote = note.trimEnd();
    const separator = previousNote ? "\n\n" : "";

    return `${previousNote}${separator}[${labels.patientClinicalNotes.entryTimestampPrefix} ${timestamp}]\n`;
}

export function PatientClinicalNotesModal({ patient, onClose, onSaved }: PatientClinicalNotesModalProps) {
    const copy = labels.patientClinicalNotes;
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [writeVerification, setWriteVerification] =
        useState<WriteVerificationMeta | null>(null);
    const noteInputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const nextNote = withTimestampedEntry(
            patient?.secure_request_profile?.clinicalNotes || ""
        );
        setNote(nextNote);
        setMessage("");
        setWriteVerification(null);

        if (window.matchMedia("(min-width: 768px)").matches) {
            requestAnimationFrame(() => {
                noteInputRef.current?.focus();
                noteInputRef.current?.setSelectionRange(nextNote.length, nextNote.length);
            });
        }
    }, [patient?._id]);

    if (!patient) return null;

    const save = async () => {
        if (saving) return;
        setSaving(true);
        setMessage("");
        setWriteVerification(null);
        const response = await updatePatient(patient._id, {
            secure_request_profile: {
                ...(patient.secure_request_profile || {}),
                clinicalNotes: note,
            },
        });
        if (response.error) {
            setMessage(response.error.message || copy.error);
        } else if (response.data) {
            onSaved(response.data);
            setMessage(copy.saved);
            setWriteVerification(response.meta.writeVerification ?? null);
        }
        setSaving(false);
    };

    return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label={copy.title}>
        <section className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <header className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
                <div><h2 className="text-lg font-semibold text-gray-950">{copy.title}</h2><p className="mt-1 text-sm text-gray-600">{patient.prenom} {patient.nom}</p></div>
                <button type="button" onClick={onClose} className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100" title={copy.close}><ArrowLeft className="h-5 w-5" />{copy.back}</button>
            </header>
            <div className="space-y-4 overflow-y-auto p-5">
                <p className="text-sm text-gray-600">{copy.description}</p>
                <label className="block text-sm font-medium text-gray-800">{copy.currentNote}
                    <textarea ref={noteInputRef} value={note} maxLength={10000} onChange={(event) => setNote(event.target.value)} placeholder={copy.placeholder} rows={12} className="mt-2 block w-full resize-y rounded border border-gray-300 px-3 py-2 text-sm leading-6 text-gray-900" />
                </label>
                {message && <p className={`rounded border p-3 text-sm ${message === copy.saved ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{message}</p>}
                <WriteVerificationReceipt
                    verification={writeVerification}
                    labels={labels.writeVerification}
                />
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                    <ClinicalNoteHistory patient={patient} onRestored={(restoredPatient) => { onSaved(restoredPatient); setNote(restoredPatient.secure_request_profile?.clinicalNotes || ""); }} />
                    <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={saving} onClick={onClose} className="inline-flex items-center gap-2 rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"><X className="h-4 w-4" />{copy.discard}</button>
                        <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"><Save className="h-4 w-4" />{saving ? copy.saving : copy.save}</button>
                    </div>
                </div>
            </div>
        </section>
    </div>;
}
