import { useEffect, useState } from "react";

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

const CACHE_KEY = "clinia_last_clinical_payload";

const EMPTY_FORM: ClinicalPayload = {
    age: 55,
    sex: "male",
    symptoms: [],
    medical_history: [],
    current_medications: [],
};

function loadCachedForm(): ClinicalPayload | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function saveCachedForm(data: ClinicalPayload) {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
}

function clearCachedForm() {
    localStorage.removeItem(CACHE_KEY);
}

function Field({
                   highlight,
                   children,
               }: {
    highlight: boolean;
    children: React.ReactNode;
}) {
    return (
        <div
            className={
                highlight
                    ? "ring-2 ring-orange-400 bg-orange-50 rounded p-1"
                    : ""
            }
        >
            {children}
        </div>
    );
}

export function ClinicalForm({
                                 onSubmit,
                                 loading,
                                 warningMessage,
                                 highlightFields = [],
                             }: {
    onSubmit: (payload: ClinicalPayload) => void;
    loading: boolean;
    warningMessage?: string;
    highlightFields?: string[];
}) {
    const [form, setForm] = useState<ClinicalPayload>(
        loadCachedForm() ?? EMPTY_FORM
    );

    useEffect(() => {
        saveCachedForm(form);
    }, [form]);

    function update<K extends keyof ClinicalPayload>(key: K, value: any) {
        setForm((prev) => ({ ...prev, [key]: value }));
    }

    function parseList(v: string): string[] {
        return v.split(",").map((s) => s.trim()).filter(Boolean);
    }

    const isHighlighted = (field: string) => highlightFields.includes(field);

    function resetPatient() {
        clearCachedForm();
        setForm(EMPTY_FORM);
    }

    return (
        <div className="bg-white p-6 rounded border space-y-6">
            {warningMessage && (
                <div className="border border-orange-300 bg-orange-50 p-4 rounded text-orange-800">
                    {warningMessage}
                </div>
            )}

            <h2 className="text-lg font-semibold">Données cliniques</h2>

            <Field highlight={isHighlighted("weight")}>
                <input
                    className="input w-full"
                    placeholder="Poids (kg)"
                    value={form.weight ?? ""}
                    onChange={(e) =>
                        update(
                            "weight",
                            e.target.value ? Number(e.target.value) : undefined
                        )
                    }
                />
            </Field>

            <Field highlight={isHighlighted("height")}>
                <input
                    className="input w-full"
                    placeholder="Taille (cm)"
                    value={form.height ?? ""}
                    onChange={(e) =>
                        update(
                            "height",
                            e.target.value ? Number(e.target.value) : undefined
                        )
                    }
                />
            </Field>

            <Field highlight={isHighlighted("symptoms")}>
                <input
                    className="input w-full"
                    placeholder="Symptômes"
                    value={form.symptoms.join(", ")}
                    onChange={(e) =>
                        update("symptoms", parseList(e.target.value))
                    }
                />
            </Field>

            <Field highlight={isHighlighted("medical_history")}>
                <input
                    className="input w-full"
                    placeholder="Antécédents médicaux"
                    value={form.medical_history.join(", ")}
                    onChange={(e) =>
                        update(
                            "medical_history",
                            parseList(e.target.value)
                        )
                    }
                />
            </Field>

            <Field highlight={isHighlighted("current_medications")}>
                <input
                    className="input w-full"
                    placeholder="Médication actuelle"
                    value={form.current_medications.join(", ")}
                    onChange={(e) =>
                        update(
                            "current_medications",
                            parseList(e.target.value)
                        )
                    }
                />
            </Field>

            <div className="flex gap-3">
                <button
                    disabled={loading}
                    onClick={() => onSubmit(form)}
                    className="flex-1 bg-blue-600 text-white py-2 rounded disabled:opacity-50"
                >
                    {loading ? "Analyse…" : "Analyser"}
                </button>

                <button
                    type="button"
                    onClick={resetPatient}
                    className="flex-1 bg-gray-100 text-gray-800 py-2 rounded border hover:bg-gray-200"
                >
                    Effacer les données patient
                </button>
            </div>
        </div>
    );
}
