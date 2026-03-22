import { useEffect, useState, useContext } from "react";
import { useTranslation } from "../../hooks/useTranslation";
import { HomeI18nContext } from "../../contexts/HomeI18nContext";
import type { ClinicalPayload } from "../../types/clinical";

const CACHE_KEY = "clinia_last_clinical_payload";

const EMPTY_FORM: ClinicalPayload = {
    age: 55,
    sex: "male",
    symptoms: [],
    medical_history: [],
    current_medications: [],
};

// --------------------
// Cache helpers
// --------------------
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

// --------------------
// UI helper
// --------------------
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

// --------------------
// Component
// --------------------
export function ClinicalForm({
                                 onSubmit,
                                 loading,
                                 warningMessage,
                                 highlightFields = [],
                                 initialData,
                             }: {
    onSubmit: (payload: ClinicalPayload) => void;
    loading: boolean;
    warningMessage?: string;
    highlightFields?: string[];
    initialData?: ClinicalPayload | null;
}) {
    const [form, setForm] = useState<ClinicalPayload>(
        initialData ?? loadCachedForm() ?? EMPTY_FORM
    );

    // 🔁 Recharger le formulaire quand un patient est sélectionné
    useEffect(() => {
        if (initialData) {
            setForm(initialData);
        }
    }, [initialData]);

    // 💾 Cache local automatique
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


    // Récupérer la langue courante
    const i18n = useContext(HomeI18nContext) || { locale: "fr" };
    const targetLang = i18n.locale;

    // Traductions dynamiques
    const { translated: clinicalDataLabel } = useTranslation({ text: "Données cliniques", targetLang });
    const { translated: incompleteDataLabel } = useTranslation({ text: "Données cliniques incomplètes", targetLang });
    const { translated: weightLabel } = useTranslation({ text: "Poids du patient (kg)", targetLang });
    const { translated: heightLabel } = useTranslation({ text: "Taille du patient (cm)", targetLang });
    const { translated: symptomsLabel } = useTranslation({ text: "Symptomes principaux", targetLang });
    const { translated: medicalHistoryLabel } = useTranslation({ text: "Antecedents medicaux", targetLang });
    const { translated: medicationsLabel } = useTranslation({ text: "Medication actuelle", targetLang });

    return (
        <div className="bg-white p-6 rounded border space-y-6">
            {warningMessage && (
                <div className="border border-orange-300 bg-orange-50 p-4 rounded text-orange-800">
                    <p className="font-medium">{incompleteDataLabel}</p>
                    <p className="text-sm mt-1">{warningMessage}</p>
                </div>
            )}

            <h2 className="text-lg font-semibold">{clinicalDataLabel}</h2>
            <p className="text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded px-3 py-2">
                Exemple de cas fictif: patient de 55 ans avec fatigue, polyurie et polydipsie.
            </p>

            <Field highlight={isHighlighted("weight")}> 
                <div className="space-y-1">
                    <label htmlFor="clinical-weight" className="text-sm font-medium text-gray-700">
                        {weightLabel}
                    </label>
                    <p className="text-xs text-gray-500">
                        Entrez une valeur numerique, exemple: 92
                    </p>
                    <input
                        id="clinical-weight"
                        type="number"
                        className="input w-full"
                        placeholder="Ex: 92"
                        value={form.weight ?? ""}
                        onChange={(e) =>
                            update(
                                "weight",
                                e.target.value ? Number(e.target.value) : undefined
                            )
                        }
                    />
                </div>
            </Field>

            <Field highlight={isHighlighted("height")}> 
                <div className="space-y-1">
                    <label htmlFor="clinical-height" className="text-sm font-medium text-gray-700">
                        {heightLabel}
                    </label>
                    <p className="text-xs text-gray-500">
                        Entrez une valeur numerique, exemple: 175
                    </p>
                    <input
                        id="clinical-height"
                        type="number"
                        className="input w-full"
                        placeholder="Ex: 175"
                        value={form.height ?? ""}
                        onChange={(e) =>
                            update(
                                "height",
                                e.target.value ? Number(e.target.value) : undefined
                            )
                        }
                    />
                </div>
            </Field>

            <Field highlight={isHighlighted("symptoms")}> 
                <div className="space-y-1">
                    <label htmlFor="clinical-symptoms" className="text-sm font-medium text-gray-700">
                        {symptomsLabel}
                    </label>
                    <p className="text-xs text-gray-500">
                        Separez chaque symptome par une virgule, exemple: fatigue, polydipsie
                    </p>
                    <input
                        id="clinical-symptoms"
                        className="input w-full"
                        placeholder="Ex: fatigue, polyurie"
                        value={form.symptoms.join(", ")}
                        onChange={(e) =>
                            update("symptoms", parseList(e.target.value))
                        }
                    />
                </div>
            </Field>

            <Field highlight={isHighlighted("medical_history")}> 
                <div className="space-y-1">
                    <label htmlFor="clinical-medical-history" className="text-sm font-medium text-gray-700">
                        {medicalHistoryLabel}
                    </label>
                    <p className="text-xs text-gray-500">
                        Conditions ou diagnostics connus, separes par des virgules
                    </p>
                    <input
                        id="clinical-medical-history"
                        className="input w-full"
                        placeholder="Ex: diabete type 2, HTA"
                        value={form.medical_history.join(", ")}
                        onChange={(e) =>
                            update("medical_history", parseList(e.target.value))
                        }
                    />
                </div>
            </Field>

            <Field highlight={isHighlighted("current_medications")}> 
                <div className="space-y-1">
                    <label htmlFor="clinical-current-medications" className="text-sm font-medium text-gray-700">
                        {medicationsLabel}
                    </label>
                    <p className="text-xs text-gray-500">
                        Noms des medicaments en cours, separes par des virgules
                    </p>
                    <input
                        id="clinical-current-medications"
                        className="input w-full"
                        placeholder="Ex: metformine 500mg bid"
                        value={form.current_medications.join(", ")}
                        onChange={(e) =>
                            update(
                                "current_medications",
                                parseList(e.target.value)
                            )
                        }
                    />
                </div>
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
