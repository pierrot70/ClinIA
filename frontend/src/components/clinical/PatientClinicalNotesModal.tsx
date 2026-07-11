import { useEffect, useState } from "react";
import { Save, X } from "lucide-react";
import { labels } from "../../i18n/uiLabels";
import { updatePatient, type Patient } from "../../services/patientsApi";
import { ClinicalNoteHistory } from "./ClinicalNoteHistory";

type PatientClinicalNotesModalProps = {
    patient: Patient | null;
    onClose: () => void;
    onSaved: (patient: Patient) => void;
};

export function PatientClinicalNotesModal({ patient, onClose, onSaved }: PatientClinicalNotesModalProps) {
    const copy = labels.patientClinicalNotes;
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        setNote(patient?.secure_request_profile?.clinicalNotes || "");
        setMessage("");
    }, [patient]);

    if (!patient) return null;

    const save = async () => {
        if (saving) return;
        setSaving(true);
        setMessage("");
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
        }
        setSaving(false);
    };

    return <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label={copy.title}>
        <section className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <header className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
                <div><h2 className="text-lg font-semibold text-gray-950">{copy.title}</h2><p className="mt-1 text-sm text-gray-600">{patient.prenom} {patient.nom}</p></div>
                <button type="button" onClick={onClose} className="rounded p-2 text-gray-600 hover:bg-gray-100" title={copy.close}><X className="h-5 w-5" /><span className="sr-only">{copy.close}</span></button>
            </header>
            <div className="space-y-4 overflow-y-auto p-5">
                <p className="text-sm text-gray-600">{copy.description}</p>
                <label className="block text-sm font-medium text-gray-800">{copy.currentNote}
                    <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={copy.placeholder} rows={12} className="mt-2 block w-full resize-y rounded border border-gray-300 px-3 py-2 text-sm leading-6 text-gray-900" />
                </label>
                {message && <p className={`rounded border p-3 text-sm ${message === copy.saved ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{message}</p>}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                    <ClinicalNoteHistory patient={patient} onRestored={(restoredPatient) => { onSaved(restoredPatient); setNote(restoredPatient.secure_request_profile?.clinicalNotes || ""); }} />
                    <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"><Save className="h-4 w-4" />{saving ? copy.saving : copy.save}</button>
                </div>
            </div>
        </section>
    </div>;
}
