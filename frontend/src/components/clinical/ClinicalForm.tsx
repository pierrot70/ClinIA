import { useEffect, useState } from "react";

type ClinicalPayload = {
    age: number;
    sex: "male" | "female" | "other";
    weight?: number;
    height?: number;
    symptoms: string[];
    medical_history: string[];
    current_medications: string[];
};

const CACHE_KEY = "clinia_last_clinical_payload";

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
        loadCachedForm() ?? {
            age: 55,
            sex: "male",
            symptoms: [],
            medical_history: [],
            current_medications: [],
        }
    );

    useEffect(() => {
        saveCachedForm(form);
    }, [form]);

    function update<K extends keyof ClinicalPayload>(key: K, value: any) {
        setForm((p) => ({ ...p, [key]: value }));
    }

    function parseList(value: string): string[] {
        return value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
    }

    const isHighlighted = (field: string) =>
        highlightFields.includes(field);

    return (
        <div className="bg-white p-6 rounded border space-y-6">
            {warningMessage && (
                <div className="border border-orange-300 bg-orange-50 p-4 rounded text-orange-800">
                    <p className="font-medium">Données cliniques incomplètes</p>
                    <p className="text-sm mt-1">{warningMessage}</p>
                </div>
            )}

            <Field highlight={isHighlighted("weight")}>
                <input
                    className="input w-full"
                    placeholder="Poids (kg)"
                    value={form.weight ?? ""}
                    onChange={(e) =>
                        update(
                            "weight",
                            e.target.value
                                ? Number(e.target.value)
                                : undefined
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
                            e.target.value
                                ? Number(e.target.value)
                                : undefined
                        )
                    }
                />
            </Field>

            <Field highlight={isHighlighted("symptoms")}>
                <input
                    className="input w-full"
                    placeholder="Symptômes (ex: fatigue, soif)"
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

            <button
                disabled={loading}
                onClick={() => onSubmit(form)}
                className="w-full bg-blue-600 text-white py-2 rounded disabled:opacity-50"
            >
                {loading ? "Analyse en cours…" : "Analyser"}
            </button>
        </div>
    );
}
