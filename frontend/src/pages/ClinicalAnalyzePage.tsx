import { useEffect, useState } from "react";
import { ClinicalForm } from "../components/clinical/ClinicalForm";
import { ClinicalResultPage } from "./ClinicalResultPage";
import { analyzeClinicalCase } from "../services/clinicalApi";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type ClinicalPayload = {
    age: number;
    sex: "male" | "female" | "other";
    weight?: number;
    height?: number;
    blood_pressure?: {
        systolic?: number;
        diastolic?: number;
    };
    symptoms: string[];
    medical_history: string[];
    current_medications: string[];
};

type StoredPatient = {
    id: number;
    label: string;
    payload: ClinicalPayload;
    createdAt: number;
    lastAnalysisComplete: boolean;
};

/* ------------------------------------------------------------------ */
/* LocalStorage helpers                                                */
/* ------------------------------------------------------------------ */

const PATIENTS_KEY = "clinia_recent_patients";
const CURRENT_FORM_KEY = "clinia_last_clinical_payload";

function loadPatients(): StoredPatient[] {
    try {
        return JSON.parse(localStorage.getItem(PATIENTS_KEY) || "[]");
    } catch {
        return [];
    }
}

function savePatients(patients: StoredPatient[]) {
    localStorage.setItem(PATIENTS_KEY, JSON.stringify(patients));
}

function emptyArray(arr?: string[]) {
    return !arr || arr.length === 0;
}

function computeMissingFields(payload: ClinicalPayload): string[] {
    const missing: string[] = [];

    if (payload.weight == null) missing.push("weight");
    if (payload.height == null) missing.push("height");
    if (!payload.blood_pressure?.systolic) missing.push("blood_pressure.systolic");
    if (!payload.blood_pressure?.diastolic) missing.push("blood_pressure.diastolic");
    if (emptyArray(payload.symptoms)) missing.push("symptoms");
    if (emptyArray(payload.medical_history)) missing.push("medical_history");
    if (emptyArray(payload.current_medications)) missing.push("current_medications");

    return missing;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function ClinicalAnalyzePage() {
    const [activeTab, setActiveTab] = useState<"patient" | "clinical">("patient");

    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [warning, setWarning] = useState<string>();
    const [highlightFields, setHighlightFields] = useState<string[]>([]);

    const [patients, setPatients] = useState<StoredPatient[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<StoredPatient | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editLabel, setEditLabel] = useState("");

    useEffect(() => {
        setPatients(loadPatients());
    }, []);

    /* ------------------------------------------------------------------ */
    /* Analyse                                                            */
    /* ------------------------------------------------------------------ */

    async function handleSubmit(payload: ClinicalPayload) {
        setLoading(true);
        setWarning(undefined);
        setHighlightFields([]);

        try {
            const data = await analyzeClinicalCase(payload);
            const isComplete = data?.diagnosis?.certainty_level !== "low";

            if (!isComplete) {
                setWarning(
                    "Les données cliniques sont insuffisantes pour fournir une analyse fiable."
                );
                setHighlightFields(computeMissingFields(payload));
                setResult(null);
                setActiveTab("patient");
                return;
            }

            setResult(data);
            setActiveTab("clinical");

            const updated: StoredPatient[] = [
                {
                    id: Date.now(),
                    label: `Patient ${patients.length + 1}`,
                    payload,
                    createdAt: Date.now(),
                    lastAnalysisComplete: true,
                },
                ...patients,
            ].slice(0, 10);

            savePatients(updated);
            setPatients(updated);
            setSelectedPatient(null);
        } catch {
            setWarning("Erreur technique. Veuillez réessayer.");
            setResult(null);
            setActiveTab("patient");
        } finally {
            setLoading(false);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Patient actions                                                    */
    /* ------------------------------------------------------------------ */

    function startNewPatient() {
        setSelectedPatient(null);
        setResult(null);
        setWarning(undefined);
        setHighlightFields([]);
        setActiveTab("patient");
        localStorage.removeItem(CURRENT_FORM_KEY);
    }

    function renamePatient(id: number) {
        const updated = patients.map((p) =>
            p.id === id ? { ...p, label: editLabel || p.label } : p
        );
        savePatients(updated);
        setPatients(updated);
        setEditingId(null);
    }

    function deletePatient(id: number) {
        if (!confirm("Supprimer ce patient ?")) return;
        const updated = patients.filter((p) => p.id !== id);
        savePatients(updated);
        setPatients(updated);
        setSelectedPatient(null);
    }

    /* ------------------------------------------------------------------ */
    /* Render                                                             */
    /* ------------------------------------------------------------------ */

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">

            {/* Patients récents */}
            {patients.length > 0 && (
                <div className="bg-white border rounded p-4 space-y-2">
                    <h3 className="text-sm font-semibold text-gray-600">
                        Patients récents
                    </h3>

                    {patients.map((p) => (
                        <div
                            key={p.id}
                            className="flex items-center gap-2 border rounded px-3 py-2"
                        >
                            <button
                                onClick={() => {
                                    setSelectedPatient(p);
                                    setResult(null);
                                    setWarning(undefined);
                                    setHighlightFields([]);
                                    setActiveTab("patient");
                                }}
                                className="flex-1 text-left text-sm hover:underline"
                            >
                                {editingId === p.id ? (
                                    <input
                                        autoFocus
                                        value={editLabel}
                                        onChange={(e) => setEditLabel(e.target.value)}
                                        onBlur={() => renamePatient(p.id)}
                                        onKeyDown={(e) =>
                                            e.key === "Enter" && renamePatient(p.id)
                                        }
                                        className="border px-1 rounded w-full"
                                    />
                                ) : (
                                    p.label
                                )}
                            </button>

                            <span
                                className={`text-xs px-2 py-1 rounded ${
                                    p.lastAnalysisComplete
                                        ? "bg-green-100 text-green-700"
                                        : "bg-orange-100 text-orange-700"
                                }`}
                            >
                                {p.lastAnalysisComplete ? "Analyse complète" : "Incomplète"}
                            </span>

                            <button
                                onClick={() => {
                                    setEditingId(p.id);
                                    setEditLabel(p.label);
                                }}
                                className="text-xs text-blue-600 hover:underline"
                            >
                                Renommer
                            </button>

                            <button
                                onClick={() => deletePatient(p.id)}
                                className="text-xs text-red-600 hover:underline"
                            >
                                Supprimer
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Onglets Patient / Clinique / Nouveau patient */}
            <div className="bg-white border rounded p-3 flex items-center gap-3">
                <button
                    onClick={() => setActiveTab("patient")}
                    className={`px-4 py-2 rounded text-sm font-medium border ${
                        activeTab === "patient"
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                >
                    Patient
                </button>

                <button
                    onClick={() => setActiveTab("clinical")}
                    disabled={!result}
                    className={`px-4 py-2 rounded text-sm font-medium border ${
                        activeTab === "clinical" && result
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-700 hover:bg-gray-50"
                    } ${!result ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                    Clinique
                </button>

                <div className="flex-1" />

                <button
                    onClick={startNewPatient}
                    className="px-4 py-2 rounded text-sm font-medium border bg-white hover:bg-gray-100"
                >
                    ➕ Nouveau patient
                </button>
            </div>

            {/* Contenu */}
            {activeTab === "patient" && !result && (
                <ClinicalForm
                    onSubmit={handleSubmit}
                    loading={loading}
                    warningMessage={warning}
                    highlightFields={highlightFields}
                    initialData={selectedPatient?.payload ?? null}
                />
            )}

            {activeTab === "clinical" && result && (
                <ClinicalResultPage data={result} />
            )}
        </div>
    );
}
