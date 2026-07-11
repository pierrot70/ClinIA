import { useEffect, useState } from "react";
import { History, RotateCcw, X } from "lucide-react";
import { labels } from "../../i18n/uiLabels";
import {
    fetchPatientClinicalNoteVersions,
    restorePatientClinicalNoteVersion,
    type Patient,
    type PatientClinicalNoteVersion,
} from "../../services/patientsApi";

type ClinicalNoteHistoryProps = {
    patient: Patient;
    onRestored: (patient: Patient) => void;
};

function formatDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString("fr-CA");
}

function changeTypeLabel(version: PatientClinicalNoteVersion) {
    const copy = labels.clinicalNoteHistory;
    if (version.changeType === "BASELINE") return copy.baseline;
    if (version.changeType === "RESTORE") return copy.restoreType;
    return copy.update;
}

export function ClinicalNoteHistory({ patient, onRestored }: ClinicalNoteHistoryProps) {
    const copy = labels.clinicalNoteHistory;
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [restoringId, setRestoringId] = useState("");
    const [versions, setVersions] = useState<PatientClinicalNoteVersion[]>([]);
    const [error, setError] = useState("");

    const load = async () => {
        setLoading(true);
        setError("");
        const response = await fetchPatientClinicalNoteVersions(patient._id);
        if (response.error) {
            setError(response.error.message || copy.error);
            setVersions([]);
        } else if (response.data) {
            setVersions(response.data);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (open) void load();
    }, [open, patient._id]);

    const restore = async (version: PatientClinicalNoteVersion) => {
        if (!window.confirm(copy.confirmRestore)) return;
        setRestoringId(version.id);
        setError("");
        const response = await restorePatientClinicalNoteVersion(patient._id, version.id);
        if (response.error) {
            setError(response.error.message || copy.error);
        } else if (response.data) {
            onRestored(response.data);
            await load();
        }
        setRestoringId("");
    };

    return <>
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <History className="h-4 w-4" />
            {copy.open}
        </button>
        {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label={copy.title}>
            <section className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
                <header className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
                    <div><h2 className="text-lg font-semibold text-gray-950">{copy.title}</h2><p className="mt-1 text-sm text-gray-600">{copy.description}</p></div>
                    <button type="button" onClick={() => setOpen(false)} className="rounded p-2 text-gray-600 hover:bg-gray-100" title={copy.close}><X className="h-5 w-5" /><span className="sr-only">{copy.close}</span></button>
                </header>
                <div className="overflow-y-auto p-5">
                    {error && <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                    {loading ? <p className="text-sm text-gray-600">{copy.loading}</p> : versions.length === 0 ? <p className="text-sm text-gray-600">{copy.empty}</p> : <div className="space-y-3">
                        {versions.map((version, index) => <article key={version.id} className="border border-gray-200 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-semibold text-gray-950">{copy.version} {version.version} · {changeTypeLabel(version)}{index === 0 ? ` · ${copy.current}` : ""}</div><div className="mt-1 text-xs text-gray-500">{copy.savedAt} {formatDate(version.createdAt)} · {copy.author} {version.actorUsernameMasked}</div></div><button type="button" disabled={restoringId === version.id} onClick={() => void restore(version)} className="inline-flex items-center gap-2 rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"><RotateCcw className="h-4 w-4" />{restoringId === version.id ? copy.restoring : copy.restore}</button></div>
                            <pre className="mt-3 whitespace-pre-wrap break-words border-t border-gray-100 pt-3 font-sans text-sm leading-6 text-gray-800">{version.note || "-"}</pre>
                        </article>)}
                    </div>}
                </div>
            </section>
        </div>}
    </>;
}
