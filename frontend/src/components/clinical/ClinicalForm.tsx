import { useEffect, useState, useContext } from "react";
import { useTranslation } from "../../hooks/useTranslation";
import { HomeI18nContext } from "../../contexts/HomeI18nContext";
import { labels } from "../../i18n/uiLabels";
import type { ClinicalPayload, Sex } from "../../types/clinical";

const CACHE_KEY = "clinia_last_clinical_payload";

const EMPTY_FORM: ClinicalPayload = {
    age: 55,
    sex: "male",
    diagnosis: "",
    symptoms: [],
    medical_history: [],
    current_medications: [],
};

const EXAMPLE_CASES: Record<string, ClinicalPayload> = {
    hypertension55: {
        age: 55,
        sex: "male",
        diagnosis: "Hypertension arterielle",
        weight: 92,
        height: 175,
        blood_pressure: {
            systolic: 145,
            diastolic: 92,
        },
        symptoms: ["Cephalee", "Pression arterielle elevee"],
        medical_history: ["Dyslipidemie"],
        current_medications: ["Aucune"],
    },
    gastricCancer59: {
        age: 59,
        sex: "female",
        diagnosis: "Cancer de l'estomac",
        weight: 63,
        height: 165,
        symptoms: ["Douleur epigastrique", "Perte de poids", "Nausees"],
        medical_history: ["Anemie"],
        current_medications: ["Pantoprazole"],
    },
    mononucleosis35: {
        age: 35,
        sex: "female",
        diagnosis: "Mononucleose infectieuse",
        weight: 60,
        height: 168,
        symptoms: ["Fatigue intense", "Fievre", "Adenopathies cervicales"],
        medical_history: [],
        current_medications: ["Aucune"],
    },
    cataract72: {
        age: 72,
        sex: "female",
        diagnosis: "Cataracte",
        weight: 68,
        height: 162,
        symptoms: ["Vision floue progressive", "Eblouissements", "Baisse de l'acuite visuelle"],
        medical_history: ["Diabete de type 2"],
        current_medications: ["Metformine"],
    },
    majorDepression42: {
        age: 42,
        sex: "male",
        diagnosis: "Trouble depressif majeur",
        weight: 81,
        height: 178,
        symptoms: ["Humeur depressive", "Insomnie", "Perte d'interet", "Fatigue"],
        medical_history: ["Anxiete generalisee"],
        current_medications: ["Aucune"],
    },
};

function clonePayload(payload: ClinicalPayload): ClinicalPayload {
    return {
        ...payload,
        blood_pressure: payload.blood_pressure
            ? { ...payload.blood_pressure }
            : undefined,
        symptoms: [...payload.symptoms],
        medical_history: [...payload.medical_history],
        current_medications: [...payload.current_medications],
    };
}

function formatList(values: string[] | undefined) {
    return Array.isArray(values) ? values.join(", ") : "";
}

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
    const [selectedExampleCase, setSelectedExampleCase] = useState("");
    const [listInputs, setListInputs] = useState(() => ({
        symptoms: formatList((initialData ?? loadCachedForm() ?? EMPTY_FORM).symptoms),
        medical_history: formatList(
            (initialData ?? loadCachedForm() ?? EMPTY_FORM).medical_history
        ),
        current_medications: formatList(
            (initialData ?? loadCachedForm() ?? EMPTY_FORM).current_medications
        ),
    }));

    // 🔁 Recharger le formulaire quand un patient est sélectionné
    useEffect(() => {
        if (initialData) {
            applyFormData(initialData);
            setSelectedExampleCase("");
        }
    }, [initialData]);

    // 💾 Cache local automatique
    useEffect(() => {
        saveCachedForm(form);
    }, [form]);

    function update<K extends keyof ClinicalPayload>(key: K, value: any) {
        setForm((prev) => ({ ...prev, [key]: value }));
    }

    function applyFormData(payload: ClinicalPayload) {
        const nextForm = clonePayload(payload);
        setForm(nextForm);
        setListInputs({
            symptoms: formatList(nextForm.symptoms),
            medical_history: formatList(nextForm.medical_history),
            current_medications: formatList(nextForm.current_medications),
        });
    }

    function parseList(v: string): string[] {
        return v.split(",").map((s) => s.trim()).filter(Boolean);
    }

    function updateListField(
        key: "symptoms" | "medical_history" | "current_medications",
        rawValue: string
    ) {
        setListInputs((prev) => ({
            ...prev,
            [key]: rawValue,
        }));
        update(key, parseList(rawValue));
    }

    const isHighlighted = (field: string) => highlightFields.includes(field);

    function resetPatient() {
        clearCachedForm();
        applyFormData(EMPTY_FORM);
        setSelectedExampleCase("");
    }

    function handleExampleCaseChange(caseId: string) {
        setSelectedExampleCase(caseId);

        if (!caseId) {
            return;
        }

        const selectedCase = EXAMPLE_CASES[caseId];
        if (selectedCase) {
            applyFormData(selectedCase);
        }
    }


    // Récupérer la langue courante
    const i18n = useContext(HomeI18nContext) || { locale: "fr" };
    const targetLang = i18n.locale;
    const commentLabels = labels.clinicalDemo.comments;


    // Traductions dynamiques
    const { translated: clinicalDataLabel } = useTranslation({ text: "Données cliniques", targetLang });
    const { translated: incompleteDataLabel } = useTranslation({ text: "Données cliniques incomplètes", targetLang });
    const { translated: exampleCaseFieldLabel } = useTranslation({ text: "Cas exemple", targetLang });
    const { translated: exampleCaseTooltipLabel } = useTranslation({ text: commentLabels.exampleCaseTooltip, targetLang });
    const { translated: noExampleCaseLabel } = useTranslation({ text: "Aucun", targetLang });
    const { translated: patient1Label } = useTranslation({ text: "Hypertension", targetLang });
    const { translated: patient2Label } = useTranslation({ text: "Cancer de l'estomac", targetLang });
    const { translated: patient3Label } = useTranslation({ text: "Mononucleose", targetLang });
    const { translated: patient4Label } = useTranslation({ text: "Cataracte", targetLang });
    const { translated: patient5Label } = useTranslation({ text: "Trouble depressif majeur", targetLang });
    const { translated: ageLabel } = useTranslation({ text: "Age du patient", targetLang });
    const { translated: sexLabel } = useTranslation({ text: "Sexe", targetLang });
    const { translated: maleLabel } = useTranslation({ text: "Homme", targetLang });
    const { translated: femaleLabel } = useTranslation({ text: "Femme", targetLang });
    const { translated: otherLabel } = useTranslation({ text: "Autre", targetLang });
    const { translated: weightLabel } = useTranslation({ text: "Poids du patient (kg)", targetLang });
    const { translated: heightLabel } = useTranslation({ text: "Taille du patient (cm)", targetLang });
    const { translated: diagnosisLabel } = useTranslation({ text: "Diagnostic / motif clinique principal", targetLang });
    const { translated: symptomsLabel } = useTranslation({ text: "Symptomes principaux", targetLang });
    const { translated: medicalHistoryLabel } = useTranslation({ text: "Antecedents medicaux", targetLang });
    const { translated: medicationsLabel } = useTranslation({ text: "Medication actuelle", targetLang });
    const { translated: diagnosisHelpLabel } = useTranslation({ text: "Entrez le diagnostic confirme ou le motif clinique principal, exemple: cancer gastrique", targetLang });
    const { translated: ageHelpLabel } = useTranslation({ text: "Entrez l'age du patient, exemple: 55", targetLang });
    const { translated: sexHelpLabel } = useTranslation({ text: "Selectionnez le sexe clinique pertinent pour l'analyse", targetLang });
    const { translated: weightHelpLabel } = useTranslation({ text: "Entrez une valeur numerique, exemple: 92", targetLang });
    const { translated: heightHelpLabel } = useTranslation({ text: "Entrez une valeur numerique, exemple: 175", targetLang });
    const { translated: symptomsHelpLabel } = useTranslation({ text: "Separez chaque symptome par une virgule, exemple: fatigue, polydipsie", targetLang });
    const { translated: medicalHistoryHelpLabel } = useTranslation({ text: "Conditions ou diagnostics connus, separes par des virgules", targetLang });
    const { translated: medicationsHelpLabel } = useTranslation({ text: "Noms des medicaments en cours, separes par des virgules", targetLang });
    const { translated: analyzeButtonLabel } = useTranslation({ text: "Analyser", targetLang });
    const { translated: analyzingButtonLabel } = useTranslation({ text: "Analyse…", targetLang });
    const { translated: clearPatientDataLabel } = useTranslation({ text: "Effacer les donnees patient", targetLang });

    const sexOptions: Array<{ value: Sex; label: string }> = [
        { value: "male", label: maleLabel },
        { value: "female", label: femaleLabel },
        { value: "other", label: otherLabel },
    ];

    return (
        <div className="bg-white p-6 rounded border space-y-6">
            {warningMessage && (
                <div className="border border-orange-300 bg-orange-50 p-4 rounded text-orange-800">
                    <p className="font-medium">{incompleteDataLabel}</p>
                    <p className="text-sm mt-1">{warningMessage}</p>
                </div>
            )}


            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <h2 className="text-lg font-semibold">{clinicalDataLabel}</h2>
                <div className="w-full md:w-80 space-y-1">
                    <label htmlFor="clinical-example-case" className="text-sm font-medium text-gray-700">
                        {exampleCaseFieldLabel}
                    </label>
                    <div className="group relative">
                        <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-3 hidden w-80 -translate-x-1/2 rounded-xl border border-sky-200 bg-cyan-50 p-3 text-left text-xs font-normal leading-5 text-cyan-950 shadow-xl group-hover:block">
                            {exampleCaseTooltipLabel}
                            <span
                                className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-sky-200 bg-cyan-50"
                                aria-hidden="true"
                            />
                        </span>
                        <select
                            id="clinical-example-case"
                            className="input w-full"
                            value={selectedExampleCase}
                            onChange={(e) => handleExampleCaseChange(e.target.value)}
                        >
                            <option value="">{noExampleCaseLabel}</option>
                            <option value="hypertension55">{patient1Label}</option>
                            <option value="gastricCancer59">{patient2Label}</option>
                            <option value="mononucleosis35">{patient3Label}</option>
                            <option value="cataract72">{patient4Label}</option>
                            <option value="majorDepression42">{patient5Label}</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field highlight={isHighlighted("age")}>
                    <div className="space-y-1">
                        <label htmlFor="clinical-age" className="text-sm font-medium text-gray-700">
                            {ageLabel}
                        </label>
                        <p className="text-xs text-gray-500">
                            {ageHelpLabel}
                        </p>
                        <input
                            id="clinical-age"
                            type="number"
                            className="input w-full"
                            placeholder="Ex: 55"
                            value={form.age ?? ""}
                            onChange={(e) =>
                                update(
                                    "age",
                                    e.target.value ? Number(e.target.value) : EMPTY_FORM.age
                                )
                            }
                        />
                    </div>
                </Field>

                <Field highlight={isHighlighted("sex")}>
                    <div className="space-y-1">
                        <label htmlFor="clinical-sex" className="text-sm font-medium text-gray-700">
                            {sexLabel}
                        </label>
                        <p className="text-xs text-gray-500">
                            {sexHelpLabel}
                        </p>
                        <select
                            id="clinical-sex"
                            className="input w-full"
                            value={form.sex}
                            onChange={(e) => update("sex", e.target.value as Sex)}
                        >
                            {sexOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </Field>
            </div>

            <Field highlight={isHighlighted("diagnosis")}>
                <div className="space-y-1">
                    <label htmlFor="clinical-diagnosis" className="text-sm font-medium text-gray-700">
                        {diagnosisLabel}
                    </label>
                    <p className="text-xs text-gray-500">
                        {diagnosisHelpLabel}
                    </p>
                    <input
                        id="clinical-diagnosis"
                        className="input w-full"
                        placeholder="Ex: cancer gastrique"
                        value={form.diagnosis ?? ""}
                        onChange={(e) => update("diagnosis", e.target.value)}
                    />
                </div>
            </Field>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field highlight={isHighlighted("weight")}> 
                    <div className="space-y-1">
                        <label htmlFor="clinical-weight" className="text-sm font-medium text-gray-700">
                            {weightLabel}
                        </label>
                        <p className="text-xs text-gray-500">
                            {weightHelpLabel}
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
                            {heightHelpLabel}
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
            </div>

            <Field highlight={isHighlighted("symptoms")}> 
                <div className="space-y-1">
                    <label htmlFor="clinical-symptoms" className="text-sm font-medium text-gray-700">
                        {symptomsLabel}
                    </label>
                    <p className="text-xs text-gray-500">
                        {symptomsHelpLabel}
                    </p>
                    <input
                        id="clinical-symptoms"
                        className="input w-full"
                        placeholder="Ex: fatigue, polyurie"
                        value={listInputs.symptoms}
                        onChange={(e) =>
                            updateListField("symptoms", e.target.value)
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
                        {medicalHistoryHelpLabel}
                    </p>
                    <input
                        id="clinical-medical-history"
                        className="input w-full"
                        placeholder="Ex: diabète, hypertension"
                        value={listInputs.medical_history}
                        onChange={(e) =>
                            updateListField("medical_history", e.target.value)
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
                        {medicationsHelpLabel}
                    </p>
                    <input
                        id="clinical-current-medications"
                        className="input w-full"
                        placeholder="Ex: metformine, insuline"
                        value={listInputs.current_medications}
                        onChange={(e) =>
                            updateListField("current_medications", e.target.value)
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
                    {loading ? analyzingButtonLabel : analyzeButtonLabel}
                </button>

                <button
                    type="button"
                    onClick={resetPatient}
                    className="flex-1 bg-gray-100 text-gray-800 py-2 rounded border hover:bg-gray-200"
                >
                    {clearPatientDataLabel}
                </button>
            </div>
        </div>
    );
}
