import { useEffect, useState, useContext } from "react";
import { useTranslation } from "../../hooks/useTranslation";
import { HomeI18nContext } from "../../contexts/HomeI18nContext";
import { labels } from "../../i18n/uiLabels";
import type {
    ClinicalPayload,
    DiabetesClinicalContext,
    PatientEthnicity,
    Sex,
} from "../../types/clinical";

const CACHE_KEY = "clinia_last_clinical_payload";
const COUNTRY_CODES = [
    "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT",
    "AU", "AW", "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI",
    "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY",
    "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN",
    "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM",
    "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK",
    "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL",
    "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM",
    "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR",
    "IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN",
    "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS",
    "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK",
    "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW",
    "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP",
    "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM",
    "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW",
    "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM",
    "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF",
    "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW",
    "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI",
    "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
] as const;

const EMPTY_FORM: ClinicalPayload = {
    age: 55,
    sex: "male",
    country: "",
    ethnicity: "prefer_not_to_say",
    diagnosis: "",
    symptoms: [],
    medical_history: [],
    current_medications: [],
};

const DEFAULT_DIABETES_CONTEXT: DiabetesClinicalContext = {
    cardiovascular_risk: "Modere a eleve",
    renal_function: "Preservee ou legerement reduite",
    fragility: "Faible",
    tolerance: "Bonne tolerance a la metformine",
    glycemic_goals: "HbA1c < 7 % si securitaire et realiste",
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
    diabetesType255: {
        age: 55,
        sex: "male",
        diagnosis: "Diabete de type 2",
        weight: 94,
        height: 176,
        symptoms: ["Polydipsie", "Polyurie", "Fatigue"],
        medical_history: ["Hypertension arterielle"],
        current_medications: ["Metformine"],
        diabetes_context: { ...DEFAULT_DIABETES_CONTEXT },
    },
};

function clonePayload(payload: ClinicalPayload): ClinicalPayload {
    return {
        ...payload,
        blood_pressure: payload.blood_pressure
            ? { ...payload.blood_pressure }
            : undefined,
        diabetes_context: payload.diabetes_context
            ? { ...payload.diabetes_context }
            : undefined,
        country: payload.country ?? "",
        ethnicity: payload.ethnicity ?? "prefer_not_to_say",
        symptoms: [...payload.symptoms],
        medical_history: [...payload.medical_history],
        current_medications: [...payload.current_medications],
    };
}

function normalize(value: string | undefined) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function formatList(values: string[] | undefined) {
    return Array.isArray(values) ? values.join(", ") : "";
}

function normalizeStringArrayInput(value: unknown) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean);
}

function normalizeNumberInput(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
}

function normalizeOptionalStringInput(value: unknown) {
    return typeof value === "string" ? value : undefined;
}

function buildPayloadFromImportedJson(
    parsed: unknown,
    fallbackCountry: string
): ClinicalPayload | null {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
    }

    const source = parsed as Record<string, unknown>;
    const age = normalizeNumberInput(source.age);
    const sex =
        source.sex === "male" || source.sex === "female" || source.sex === "other"
            ? source.sex
            : null;

    if (!age || !sex) {
        return null;
    }

    const bloodPressure =
        source.blood_pressure &&
        typeof source.blood_pressure === "object" &&
        !Array.isArray(source.blood_pressure)
            ? {
                  systolic: normalizeNumberInput(
                      (source.blood_pressure as Record<string, unknown>).systolic
                  ),
                  diastolic: normalizeNumberInput(
                      (source.blood_pressure as Record<string, unknown>).diastolic
                  ),
              }
            : undefined;

    const diabetesContext =
        source.diabetes_context &&
        typeof source.diabetes_context === "object" &&
        !Array.isArray(source.diabetes_context)
            ? {
                  cardiovascular_risk: normalizeOptionalStringInput(
                      (source.diabetes_context as Record<string, unknown>)
                          .cardiovascular_risk
                  ),
                  renal_function: normalizeOptionalStringInput(
                      (source.diabetes_context as Record<string, unknown>)
                          .renal_function
                  ),
                  fragility: normalizeOptionalStringInput(
                      (source.diabetes_context as Record<string, unknown>).fragility
                  ),
                  tolerance: normalizeOptionalStringInput(
                      (source.diabetes_context as Record<string, unknown>).tolerance
                  ),
                  glycemic_goals: normalizeOptionalStringInput(
                      (source.diabetes_context as Record<string, unknown>)
                          .glycemic_goals
                  ),
              }
            : undefined;

    return {
        age,
        sex,
        country: typeof source.country === "string" ? source.country : fallbackCountry,
        ethnicity:
            source.ethnicity === "caucasian" ||
            source.ethnicity === "black" ||
            source.ethnicity === "asian" ||
            source.ethnicity === "hispanic_latino" ||
            source.ethnicity === "middle_eastern_north_african" ||
            source.ethnicity === "indigenous" ||
            source.ethnicity === "south_asian" ||
            source.ethnicity === "southeast_asian" ||
            source.ethnicity === "mixed" ||
            source.ethnicity === "other" ||
            source.ethnicity === "prefer_not_to_say"
                ? source.ethnicity
                : "prefer_not_to_say",
        diagnosis: typeof source.diagnosis === "string" ? source.diagnosis : "",
        weight: normalizeNumberInput(source.weight),
        height: normalizeNumberInput(source.height),
        blood_pressure:
            bloodPressure?.systolic || bloodPressure?.diastolic
                ? bloodPressure
                : undefined,
        symptoms: normalizeStringArrayInput(source.symptoms),
        medical_history: normalizeStringArrayInput(source.medical_history),
        current_medications: normalizeStringArrayInput(source.current_medications),
        diabetes_context: diabetesContext,
    };
}

function getBrowserCountryCode() {
    if (typeof navigator === "undefined") {
        return "";
    }

    const localeCandidates = [
        ...(Array.isArray(navigator.languages) ? navigator.languages : []),
        navigator.language,
    ].filter(Boolean);

    for (const locale of localeCandidates) {
        const parts = String(locale)
            .replace("_", "-")
            .split("-");
        const region = parts
            .slice(1)
            .find((part) => /^[A-Z]{2}$/.test(part.toUpperCase()));
        if (region) {
            return region.toUpperCase();
        }
    }

    return "";
}

function buildCountryOptions(targetLang: string) {
    const displayNames =
        typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
            ? new Intl.DisplayNames([targetLang, "fr", "en"], { type: "region" })
            : null;

    return COUNTRY_CODES.map((code) => ({
        value: code,
        label: displayNames?.of(code) ?? code,
    })).sort((a, b) => a.label.localeCompare(b.label, targetLang));
}

function getCountryLabel(code: string, targetLang: string) {
    if (!code) {
        return "";
    }

    const displayNames =
        typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
            ? new Intl.DisplayNames([targetLang, "fr", "en"], { type: "region" })
            : null;

    return displayNames?.of(code) ?? code;
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
                                 onCompareSubmit,
                                 loading,
                                 compareLoading = false,
                                 warningMessage,
                                 highlightFields = [],
                                 initialData,
                             }: {
    onSubmit: (payload: ClinicalPayload) => void;
    onCompareSubmit?: (
        firstPayload: ClinicalPayload,
        secondPayload: ClinicalPayload
    ) => void | Promise<void>;
    loading: boolean;
    compareLoading?: boolean;
    warningMessage?: string;
    highlightFields?: string[];
    initialData?: ClinicalPayload | null;
}) {
    const [form, setForm] = useState<ClinicalPayload>(
        initialData ?? loadCachedForm() ?? EMPTY_FORM
    );
    const [selectedExampleCase, setSelectedExampleCase] = useState("");
    const [isDiabetesModalOpen, setIsDiabetesModalOpen] = useState(false);
    const [browserCountryCode, setBrowserCountryCode] = useState("");
    const [jsonImportValue, setJsonImportValue] = useState("");
    const [comparisonModeEnabled, setComparisonModeEnabled] = useState(false);
    const [comparisonJsonCaseOne, setComparisonJsonCaseOne] = useState("");
    const [comparisonJsonCaseTwo, setComparisonJsonCaseTwo] = useState("");
    const [jsonImportFeedback, setJsonImportFeedback] = useState<{
        type: "success" | "error";
        message: string;
    } | null>(null);
    const [comparisonFeedback, setComparisonFeedback] = useState<{
        type: "success" | "error";
        message: string;
    } | null>(null);
    const [diabetesModalValues, setDiabetesModalValues] = useState<{
        weight: string;
        cardiovascular_risk: string;
        renal_function: string;
        fragility: string;
        tolerance: string;
        glycemic_goals: string;
    }>({
        weight: "",
        cardiovascular_risk: DEFAULT_DIABETES_CONTEXT.cardiovascular_risk ?? "",
        renal_function: DEFAULT_DIABETES_CONTEXT.renal_function ?? "",
        fragility: DEFAULT_DIABETES_CONTEXT.fragility ?? "",
        tolerance: DEFAULT_DIABETES_CONTEXT.tolerance ?? "",
        glycemic_goals: DEFAULT_DIABETES_CONTEXT.glycemic_goals ?? "",
    });
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
        setIsDiabetesModalOpen(false);
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

    function isType2DiabetesContext() {
        const diagnosis = normalize(form.diagnosis);

        return (
            selectedExampleCase === "diabetesType255" ||
            diagnosis.includes("diabete de type 2") ||
            diagnosis.includes("diabete type 2") ||
            diagnosis.includes("type 2") ||
            diagnosis.includes("diabetes")
        );
    }

    function openDiabetesModal() {
        setDiabetesModalValues({
            weight: String(form.weight ?? EXAMPLE_CASES.diabetesType255.weight ?? ""),
            cardiovascular_risk:
                form.diabetes_context?.cardiovascular_risk ??
                DEFAULT_DIABETES_CONTEXT.cardiovascular_risk ??
                "",
            renal_function:
                form.diabetes_context?.renal_function ??
                DEFAULT_DIABETES_CONTEXT.renal_function ??
                "",
            fragility:
                form.diabetes_context?.fragility ??
                DEFAULT_DIABETES_CONTEXT.fragility ??
                "",
            tolerance:
                form.diabetes_context?.tolerance ??
                DEFAULT_DIABETES_CONTEXT.tolerance ??
                "",
            glycemic_goals:
                form.diabetes_context?.glycemic_goals ??
                DEFAULT_DIABETES_CONTEXT.glycemic_goals ??
                "",
        });
        setIsDiabetesModalOpen(true);
    }

    function saveDiabetesModal() {
        setForm((prev) => ({
            ...prev,
            weight: diabetesModalValues.weight
                ? Number(diabetesModalValues.weight)
                : prev.weight,
            diabetes_context: {
                cardiovascular_risk: diabetesModalValues.cardiovascular_risk.trim(),
                renal_function: diabetesModalValues.renal_function.trim(),
                fragility: diabetesModalValues.fragility.trim(),
                tolerance: diabetesModalValues.tolerance.trim(),
                glycemic_goals: diabetesModalValues.glycemic_goals.trim(),
            },
        }));
        setIsDiabetesModalOpen(false);
    }


    // Récupérer la langue courante
    const i18n = useContext(HomeI18nContext) || { locale: "fr" };
    const targetLang = i18n.locale;
    const clinicalFormLabels = labels.clinicalDemo.form;
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
    const { translated: patient6Label } = useTranslation({ text: "Diabete Type 2", targetLang });
    const { translated: ageLabel } = useTranslation({ text: "Age du patient", targetLang });
    const { translated: sexLabel } = useTranslation({ text: "Sexe", targetLang });
    const { translated: countryLabel } = useTranslation({
        text: clinicalFormLabels.countryLabel,
        targetLang,
    });
    const { translated: countryHelpLabel } = useTranslation({
        text: clinicalFormLabels.countryHelp,
        targetLang,
    });
    const { translated: countryPlaceholderLabel } = useTranslation({
        text: clinicalFormLabels.countryPlaceholder,
        targetLang,
    });
    const { translated: detectedCountryPrefixLabel } = useTranslation({
        text: clinicalFormLabels.detectedCountryPrefix,
        targetLang,
    });
    const { translated: jsonImportLabel } = useTranslation({
        text: clinicalFormLabels.jsonImportLabel,
        targetLang,
    });
    const { translated: jsonImportHelpLabel } = useTranslation({
        text: clinicalFormLabels.jsonImportHelp,
        targetLang,
    });
    const { translated: jsonImportPlaceholderLabel } = useTranslation({
        text: clinicalFormLabels.jsonImportPlaceholder,
        targetLang,
    });
    const { translated: jsonImportActionLabel } = useTranslation({
        text: clinicalFormLabels.jsonImportAction,
        targetLang,
    });
    const { translated: jsonImportSuccessLabel } = useTranslation({
        text: clinicalFormLabels.jsonImportSuccess,
        targetLang,
    });
    const { translated: jsonImportInvalidLabel } = useTranslation({
        text: clinicalFormLabels.jsonImportInvalid,
        targetLang,
    });
    const { translated: comparisonToggleLabel } = useTranslation({
        text: clinicalFormLabels.comparisonToggle,
        targetLang,
    });
    const { translated: comparisonHelpLabel } = useTranslation({
        text: clinicalFormLabels.comparisonHelp,
        targetLang,
    });
    const { translated: comparisonCaseOneLabel } = useTranslation({
        text: clinicalFormLabels.comparisonCaseOneLabel,
        targetLang,
    });
    const { translated: comparisonCaseTwoLabel } = useTranslation({
        text: clinicalFormLabels.comparisonCaseTwoLabel,
        targetLang,
    });
    const { translated: comparisonActionLabel } = useTranslation({
        text: clinicalFormLabels.comparisonAction,
        targetLang,
    });
    const { translated: comparisonSuccessLabel } = useTranslation({
        text: clinicalFormLabels.comparisonSuccess,
        targetLang,
    });
    const { translated: comparisonInvalidLabel } = useTranslation({
        text: clinicalFormLabels.comparisonInvalid,
        targetLang,
    });
    const { translated: ethnicityLabel } = useTranslation({
        text: clinicalFormLabels.ethnicityLabel,
        targetLang,
    });
    const { translated: ethnicityHelpLabel } = useTranslation({
        text: clinicalFormLabels.ethnicityHelp,
        targetLang,
    });
    const { translated: maleLabel } = useTranslation({ text: "Homme", targetLang });
    const { translated: femaleLabel } = useTranslation({ text: "Femme", targetLang });
    const { translated: otherLabel } = useTranslation({ text: "Autre", targetLang });
    const { translated: caucasianLabel } = useTranslation({
        text: clinicalFormLabels.ethnicityOptions.caucasian,
        targetLang,
    });
    const { translated: blackLabel } = useTranslation({
        text: clinicalFormLabels.ethnicityOptions.black,
        targetLang,
    });
    const { translated: asianLabel } = useTranslation({
        text: clinicalFormLabels.ethnicityOptions.asian,
        targetLang,
    });
    const { translated: hispanicLatinoLabel } = useTranslation({
        text: clinicalFormLabels.ethnicityOptions.hispanicLatino,
        targetLang,
    });
    const { translated: middleEasternNorthAfricanLabel } = useTranslation({
        text: clinicalFormLabels.ethnicityOptions.middleEasternNorthAfrican,
        targetLang,
    });
    const { translated: indigenousLabel } = useTranslation({
        text: clinicalFormLabels.ethnicityOptions.indigenous,
        targetLang,
    });
    const { translated: southAsianLabel } = useTranslation({
        text: clinicalFormLabels.ethnicityOptions.southAsian,
        targetLang,
    });
    const { translated: southeastAsianLabel } = useTranslation({
        text: clinicalFormLabels.ethnicityOptions.southeastAsian,
        targetLang,
    });
    const { translated: mixedLabel } = useTranslation({
        text: clinicalFormLabels.ethnicityOptions.mixed,
        targetLang,
    });
    const { translated: preferNotToSayLabel } = useTranslation({
        text: clinicalFormLabels.ethnicityOptions.preferNotToSay,
        targetLang,
    });
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
    const { translated: diabetesModalButtonLabel } = useTranslation({ text: "Parametres diabete type 2", targetLang });
    const { translated: diabetesModalTitleLabel } = useTranslation({ text: "Parametres cliniques supplementaires - Diabete Type 2", targetLang });
    const { translated: diabetesModalDescriptionLabel } = useTranslation({ text: "Ajustez ces parametres pour enrichir l'analyse sans alourdir les donnees cliniques principales.", targetLang });
    const { translated: cardiovascularRiskLabel } = useTranslation({ text: "Risque cardiovasculaire", targetLang });
    const { translated: renalFunctionLabel } = useTranslation({ text: "Fonction renale", targetLang });
    const { translated: fragilityLabel } = useTranslation({ text: "Fragilite", targetLang });
    const { translated: toleranceLabel } = useTranslation({ text: "Tolerance", targetLang });
    const { translated: glycemicGoalsLabel } = useTranslation({ text: "Objectifs glycemiques", targetLang });
    const { translated: saveLabel } = useTranslation({ text: "Enregistrer", targetLang });
    const { translated: cancelLabel } = useTranslation({ text: "Annuler", targetLang });

    const sexOptions: Array<{ value: Sex; label: string }> = [
        { value: "male", label: maleLabel },
        { value: "female", label: femaleLabel },
        { value: "other", label: otherLabel },
    ];
    const countryOptions = buildCountryOptions(targetLang);
    const detectedCountryLabel = getCountryLabel(browserCountryCode, targetLang);
    const ethnicityOptions: Array<{ value: PatientEthnicity; label: string }> = [
        { value: "caucasian", label: caucasianLabel },
        { value: "black", label: blackLabel },
        { value: "asian", label: asianLabel },
        { value: "hispanic_latino", label: hispanicLatinoLabel },
        {
            value: "middle_eastern_north_african",
            label: middleEasternNorthAfricanLabel,
        },
        { value: "indigenous", label: indigenousLabel },
        { value: "south_asian", label: southAsianLabel },
        { value: "southeast_asian", label: southeastAsianLabel },
        { value: "mixed", label: mixedLabel },
        { value: "other", label: otherLabel },
        { value: "prefer_not_to_say", label: preferNotToSayLabel },
    ];

    useEffect(() => {
        const browserCountry = getBrowserCountryCode();
        setBrowserCountryCode(browserCountry);

        setForm((prev) => {
            if (prev.country) {
                return prev;
            }

            if (!browserCountry) {
                return prev;
            }

            return {
                ...prev,
                country: browserCountry,
            };
        });
    }, []);

    function handleJsonImport() {
        try {
            const parsed = JSON.parse(jsonImportValue);
            const nextPayload = buildPayloadFromImportedJson(
                parsed,
                browserCountryCode
            );

            if (!nextPayload) {
                setJsonImportFeedback({
                    type: "error",
                    message: jsonImportInvalidLabel,
                });
                return;
            }

            applyFormData(nextPayload);
            setSelectedExampleCase("");
            setJsonImportFeedback({
                type: "success",
                message: jsonImportSuccessLabel,
            });
        } catch {
            setJsonImportFeedback({
                type: "error",
                message: jsonImportInvalidLabel,
            });
        }
    }

    async function handleComparisonImport() {
        try {
            const firstParsed = JSON.parse(comparisonJsonCaseOne);
            const secondParsed = JSON.parse(comparisonJsonCaseTwo);
            const firstPayload = buildPayloadFromImportedJson(
                firstParsed,
                browserCountryCode
            );
            const secondPayload = buildPayloadFromImportedJson(
                secondParsed,
                browserCountryCode
            );

            if (!firstPayload || !secondPayload || !onCompareSubmit) {
                setComparisonFeedback({
                    type: "error",
                    message: comparisonInvalidLabel,
                });
                return;
            }

            await onCompareSubmit(firstPayload, secondPayload);
            setComparisonFeedback({
                type: "success",
                message: comparisonSuccessLabel,
            });
        } catch {
            setComparisonFeedback({
                type: "error",
                message: comparisonInvalidLabel,
            });
        }
    }

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
                <div className="w-full md:w-auto flex flex-col gap-3 md:flex-row md:items-end">
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
                                <option value="diabetesType255">{patient6Label}</option>
                            </select>
                        </div>
                    </div>
                    {isType2DiabetesContext() && (
                        <button
                            type="button"
                            onClick={openDiabetesModal}
                            className="rounded border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100"
                        >
                            {diabetesModalButtonLabel}
                        </button>
                    )}
                </div>
            </div>

            <Field highlight={isHighlighted("json_import")}>
                <div className="space-y-2">
                    <label htmlFor="clinical-json-import" className="text-sm font-medium text-gray-700">
                        {jsonImportLabel}
                    </label>
                    <p className="text-xs text-gray-500">
                        {jsonImportHelpLabel}
                    </p>
                    <textarea
                        id="clinical-json-import"
                        className="input min-h-36 w-full font-mono text-xs"
                        placeholder={jsonImportPlaceholderLabel}
                        value={jsonImportValue}
                        onChange={(e) => {
                            setJsonImportValue(e.target.value);
                            if (jsonImportFeedback) {
                                setJsonImportFeedback(null);
                            }
                        }}
                    />
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <button
                            type="button"
                            onClick={handleJsonImport}
                            className="rounded border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-900 transition hover:bg-sky-100"
                        >
                            {jsonImportActionLabel}
                        </button>
                        {jsonImportFeedback ? (
                            <p
                                className={`text-xs ${
                                    jsonImportFeedback.type === "success"
                                        ? "text-emerald-700"
                                        : "text-red-600"
                                }`}
                            >
                                {jsonImportFeedback.message}
                            </p>
                        ) : null}
                    </div>
                </div>
            </Field>

            <Field highlight={isHighlighted("comparison_json_import")}>
                <div className="space-y-3 rounded-xl border border-dashed border-sky-200 bg-sky-50/60 p-4">
                    <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
                        <input
                            type="checkbox"
                            checked={comparisonModeEnabled}
                            onChange={(e) => {
                                setComparisonModeEnabled(e.target.checked);
                                setComparisonFeedback(null);
                            }}
                        />
                        {comparisonToggleLabel}
                    </label>
                    <p className="text-xs text-gray-600">{comparisonHelpLabel}</p>

                    {comparisonModeEnabled ? (
                        <div className="space-y-3">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <label className="space-y-1 text-sm text-gray-700">
                                    <span className="font-medium">{comparisonCaseOneLabel}</span>
                                    <textarea
                                        className="input min-h-40 w-full font-mono text-xs"
                                        placeholder={jsonImportPlaceholderLabel}
                                        value={comparisonJsonCaseOne}
                                        onChange={(e) => {
                                            setComparisonJsonCaseOne(e.target.value);
                                            if (comparisonFeedback) {
                                                setComparisonFeedback(null);
                                            }
                                        }}
                                    />
                                </label>
                                <label className="space-y-1 text-sm text-gray-700">
                                    <span className="font-medium">{comparisonCaseTwoLabel}</span>
                                    <textarea
                                        className="input min-h-40 w-full font-mono text-xs"
                                        placeholder={jsonImportPlaceholderLabel}
                                        value={comparisonJsonCaseTwo}
                                        onChange={(e) => {
                                            setComparisonJsonCaseTwo(e.target.value);
                                            if (comparisonFeedback) {
                                                setComparisonFeedback(null);
                                            }
                                        }}
                                    />
                                </label>
                            </div>
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <button
                                    type="button"
                                    disabled={compareLoading}
                                    onClick={handleComparisonImport}
                                    className="rounded border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100 disabled:opacity-50"
                                >
                                    {comparisonActionLabel}
                                </button>
                                {comparisonFeedback ? (
                                    <p
                                        className={`text-xs ${
                                            comparisonFeedback.type === "success"
                                                ? "text-emerald-700"
                                                : "text-red-600"
                                        }`}
                                    >
                                        {comparisonFeedback.message}
                                    </p>
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                </div>
            </Field>

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

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field highlight={isHighlighted("country")}>
                    <div className="space-y-1">
                        <label htmlFor="clinical-country" className="text-sm font-medium text-gray-700">
                            {countryLabel}
                        </label>
                        <p className="text-xs text-gray-500">
                            {countryHelpLabel}
                        </p>
                        {browserCountryCode ? (
                            <p className="text-xs font-medium text-sky-700">
                                {detectedCountryPrefixLabel} {detectedCountryLabel} ({browserCountryCode})
                            </p>
                        ) : null}
                        <select
                            id="clinical-country"
                            className="input w-full"
                            value={form.country ?? ""}
                            onChange={(e) => update("country", e.target.value)}
                        >
                            <option value="">{countryPlaceholderLabel}</option>
                            {countryOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </Field>

                <Field highlight={isHighlighted("ethnicity")}>
                    <div className="space-y-1">
                        <label htmlFor="clinical-ethnicity" className="text-sm font-medium text-gray-700">
                            {ethnicityLabel}
                        </label>
                        <p className="text-xs text-gray-500">
                            {ethnicityHelpLabel}
                        </p>
                        <select
                            id="clinical-ethnicity"
                            className="input w-full"
                            value={form.ethnicity ?? "prefer_not_to_say"}
                            onChange={(e) =>
                                update("ethnicity", e.target.value as PatientEthnicity)
                            }
                        >
                            {ethnicityOptions.map((option) => (
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

            {isDiabetesModalOpen && (
                <div
                    className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 px-4"
                    aria-modal="true"
                    role="dialog"
                >
                    <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
                        <h2 className="text-lg font-semibold text-gray-900">
                            {diabetesModalTitleLabel}
                        </h2>
                        <p className="mt-2 text-sm text-gray-600">
                            {diabetesModalDescriptionLabel}
                        </p>

                        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                            <label className="space-y-1 text-sm text-gray-700">
                                <span className="font-medium">{weightLabel}</span>
                                <input
                                    type="number"
                                    className="input w-full"
                                    value={diabetesModalValues.weight}
                                    onChange={(e) =>
                                        setDiabetesModalValues((prev) => ({
                                            ...prev,
                                            weight: e.target.value,
                                        }))
                                    }
                                />
                            </label>

                            <label className="space-y-1 text-sm text-gray-700">
                                <span className="font-medium">{cardiovascularRiskLabel}</span>
                                <input
                                    className="input w-full"
                                    value={diabetesModalValues.cardiovascular_risk}
                                    onChange={(e) =>
                                        setDiabetesModalValues((prev) => ({
                                            ...prev,
                                            cardiovascular_risk: e.target.value,
                                        }))
                                    }
                                />
                            </label>

                            <label className="space-y-1 text-sm text-gray-700">
                                <span className="font-medium">{renalFunctionLabel}</span>
                                <input
                                    className="input w-full"
                                    value={diabetesModalValues.renal_function}
                                    onChange={(e) =>
                                        setDiabetesModalValues((prev) => ({
                                            ...prev,
                                            renal_function: e.target.value,
                                        }))
                                    }
                                />
                            </label>

                            <label className="space-y-1 text-sm text-gray-700">
                                <span className="font-medium">{fragilityLabel}</span>
                                <input
                                    className="input w-full"
                                    value={diabetesModalValues.fragility}
                                    onChange={(e) =>
                                        setDiabetesModalValues((prev) => ({
                                            ...prev,
                                            fragility: e.target.value,
                                        }))
                                    }
                                />
                            </label>

                            <label className="space-y-1 text-sm text-gray-700">
                                <span className="font-medium">{toleranceLabel}</span>
                                <input
                                    className="input w-full"
                                    value={diabetesModalValues.tolerance}
                                    onChange={(e) =>
                                        setDiabetesModalValues((prev) => ({
                                            ...prev,
                                            tolerance: e.target.value,
                                        }))
                                    }
                                />
                            </label>

                            <label className="space-y-1 text-sm text-gray-700">
                                <span className="font-medium">{glycemicGoalsLabel}</span>
                                <input
                                    className="input w-full"
                                    value={diabetesModalValues.glycemic_goals}
                                    onChange={(e) =>
                                        setDiabetesModalValues((prev) => ({
                                            ...prev,
                                            glycemic_goals: e.target.value,
                                        }))
                                    }
                                />
                            </label>
                        </div>

                        <div className="mt-6 flex gap-3">
                            <button
                                type="button"
                                onClick={saveDiabetesModal}
                                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                            >
                                {saveLabel}
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsDiabetesModalOpen(false)}
                                className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                {cancelLabel}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
