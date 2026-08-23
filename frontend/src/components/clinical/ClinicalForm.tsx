import { useEffect, useState, useContext } from "react";
import { useTranslation } from "../../hooks/useTranslation";
import { useAuth } from "../../hooks/useAuth";
import { useDebounce } from "../../hooks/useDebounce";
import {
    fetchPatientById,
    fetchPatientsPaginated,
    updatePatient,
    type Patient,
} from "../../services/patientsApi";
import { HomeI18nContext } from "../../contexts/HomeI18nContext";
import { labels } from "../../i18n/uiLabels";
import { getClinicalFormReviewedStrings } from "../../i18n/clinicalFormStrings";
import { InfoTooltip } from "../system/InfoTooltip";
import type {
    ClinicalPayload,
    DiabetesClinicalContext,
    PatientEthnicity,
    Sex,
} from "../../types/clinical";

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

type ClinicalField =
    | "generalMedicine"
    | "oncology"
    | "infectiousDiseases"
    | "ophthalmology"
    | "mentalHealth"
    | "endocrinology";

const EXAMPLE_CASE_FIELDS: Record<string, ClinicalField> = {
    hypertension55: "generalMedicine",
    gastricCancer59: "oncology",
    mononucleosis35: "infectiousDiseases",
    cataract72: "ophthalmology",
    majorDepression42: "mentalHealth",
    diabetesType255: "endocrinology",
};

const COMPARISON_CASE_ONE: ClinicalPayload = {
    age: 58,
    sex: "male",
    country: "CA",
    ethnicity: "caucasian",
    diagnosis: "Diabete de type 2",
    symptoms: ["Hyperglycemie persistante", "Prise de poids progressive", "Fatigue"],
    medical_history: [
        "Hypertension arterielle",
        "Dyslipidemie",
        "Maladie cardiovasculaire aterosclerotique",
    ],
    current_medications: ["Metformine"],
    diabetes_context: {
        cardiovascular_risk: "Eleve",
        renal_function: "Preservee ou legerement reduite",
        fragility: "Faible",
        tolerance: "Bonne tolerance a la metformine",
        glycemic_goals: "HbA1c < 7 % si securitaire et realiste",
    },
};

const COMPARISON_CASE_TWO: ClinicalPayload = {
    age: 58,
    sex: "male",
    country: "CA",
    ethnicity: "caucasian",
    diagnosis: "Diabete de type 2",
    symptoms: ["Hyperglycemie persistante", "Prise de poids progressive", "Fatigue"],
    medical_history: [
        "Hypertension arterielle",
        "Dyslipidemie",
        "Maladie cardiovasculaire aterosclerotique",
    ],
    current_medications: ["Metformine", "Empagliflozine"],
    diabetes_context: {
        cardiovascular_risk: "Eleve",
        renal_function: "Preservee ou legerement reduite",
        fragility: "Faible",
        tolerance: "Bonne tolerance a la combinaison actuelle",
        glycemic_goals: "HbA1c < 7 % si securitaire et realiste",
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

function splitProfileList(value: string | undefined) {
    return String(value || "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function getProfileSex(value: string | undefined): Sex {
    const normalized = normalize(value);

    if (normalized === "female" || normalized === "femme") {
        return "female";
    }

    if (normalized === "male" || normalized === "homme") {
        return "male";
    }

    return "other";
}

function buildPayloadFromPatientProfile(
    patient: Patient,
    country: string
): ClinicalPayload {
    const profile = patient.secure_request_profile;
    const savedParameters = profile?.clinicalAnalysisParameters;

    if (savedParameters) {
        return {
            ...clonePayload(savedParameters),
            country: savedParameters.country || country,
        };
    }

    const parsedAge = Number(profile?.age);

    return {
        ...EMPTY_FORM,
        age: Number.isFinite(parsedAge) && parsedAge > 0 ? parsedAge : 0,
        sex: getProfileSex(profile?.sex),
        country,
        symptoms: splitProfileList(profile?.symptomProfile),
        medical_history: splitProfileList(profile?.comorbidityContext),
        current_medications: splitProfileList(profile?.current_medications),
    };
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

type ComparisonCaseEditorState = {
    age: string;
    sex: Sex;
    country: string;
    ethnicity: PatientEthnicity;
    diagnosis: string;
    symptoms: string;
    medical_history: string;
    current_medications: string[];
    cardiovascular_risk: string;
    renal_function: string;
    fragility: string;
    tolerance: string;
    glycemic_goals: string;
};

function buildComparisonCaseEditorState(
    payload: ClinicalPayload
): ComparisonCaseEditorState {
    return {
        age: String(payload.age ?? ""),
        sex: payload.sex ?? "male",
        country: payload.country ?? "",
        ethnicity: payload.ethnicity ?? "prefer_not_to_say",
        diagnosis: payload.diagnosis ?? "",
        symptoms: formatList(payload.symptoms),
        medical_history: formatList(payload.medical_history),
        current_medications: [...payload.current_medications],
        cardiovascular_risk: payload.diabetes_context?.cardiovascular_risk ?? "",
        renal_function: payload.diabetes_context?.renal_function ?? "",
        fragility: payload.diabetes_context?.fragility ?? "",
        tolerance: payload.diabetes_context?.tolerance ?? "",
        glycemic_goals: payload.diabetes_context?.glycemic_goals ?? "",
    };
}

function buildClinicalPayloadFromComparisonCaseEditor(
    state: ComparisonCaseEditorState
): ClinicalPayload {
    return {
        age: Number(state.age) || 0,
        sex: state.sex,
        country: state.country,
        ethnicity: state.ethnicity,
        diagnosis: state.diagnosis,
        symptoms: state.symptoms
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        medical_history: state.medical_history
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        current_medications: state.current_medications
            .map((value) => value.trim())
            .filter(Boolean),
        diabetes_context: {
            cardiovascular_risk: state.cardiovascular_risk,
            renal_function: state.renal_function,
            fragility: state.fragility,
            tolerance: state.tolerance,
            glycemic_goals: state.glycemic_goals,
        },
    };
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
                                 restoreInitialDataForCorrection = false,
                             }: {
    onSubmit: (payload: ClinicalPayload) => void | Promise<void>;
    onCompareSubmit?: (
        firstPayload: ClinicalPayload,
        secondPayload: ClinicalPayload
    ) => void | Promise<void>;
    loading: boolean;
    compareLoading?: boolean;
    warningMessage?: string;
    highlightFields?: string[];
    initialData?: ClinicalPayload | null;
    restoreInitialDataForCorrection?: boolean;
}) {
    const { isAuthenticated } = useAuth();
    const [form, setForm] = useState<ClinicalPayload>(
        initialData ?? EMPTY_FORM
    );
    const [inputMode, setInputMode] = useState<"manual" | "patient">("manual");
    const [patientSearch, setPatientSearch] = useState("");
    const [patientMatches, setPatientMatches] = useState<Patient[]>([]);
    const [patientsLoading, setPatientsLoading] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [patientSaveError, setPatientSaveError] = useState("");
    const [savingPatientParameters, setSavingPatientParameters] = useState(false);
    const [selectedClinicalField, setSelectedClinicalField] = useState<
        ClinicalField | ""
    >("");
    const [selectedExampleCase, setSelectedExampleCase] = useState("");
    const [hasRestoredClinicalData, setHasRestoredClinicalData] = useState(
        restoreInitialDataForCorrection && Boolean(initialData)
    );
    const [isDiabetesModalOpen, setIsDiabetesModalOpen] = useState(false);
    const [browserCountryCode, setBrowserCountryCode] = useState("");
    const [jsonImportValue, setJsonImportValue] = useState("");
    const [comparisonModeEnabled, setComparisonModeEnabled] = useState(false);
    const [comparisonJsonCaseOne, setComparisonJsonCaseOne] = useState("");
    const [comparisonJsonCaseTwo, setComparisonJsonCaseTwo] = useState("");
    const [comparisonJsonModalTarget, setComparisonJsonModalTarget] =
        useState<"one" | "two" | null>(null);
    const [comparisonCaseEditor, setComparisonCaseEditor] =
        useState<ComparisonCaseEditorState | null>(null);
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
        symptoms: formatList((initialData ?? EMPTY_FORM).symptoms),
        medical_history: formatList(
            (initialData ?? EMPTY_FORM).medical_history
        ),
        current_medications: formatList(
            (initialData ?? EMPTY_FORM).current_medications
        ),
    }));
    const debouncedPatientSearch = useDebounce(patientSearch, 250);

    // 🔁 Recharger le formulaire quand un patient est sélectionné
    useEffect(() => {
        if (initialData) {
            applyFormData(initialData);
            setSelectedExampleCase("");
            if (restoreInitialDataForCorrection) {
                setHasRestoredClinicalData(true);
            }
        }
    }, [initialData, restoreInitialDataForCorrection]);

    useEffect(() => {
        let active = true;

        async function loadPatientMatches() {
            const query = debouncedPatientSearch.trim();
            if (!isAuthenticated || inputMode !== "patient" || selectedPatient || query.length < 2) {
                if (active) {
                    setPatientMatches([]);
                    setPatientsLoading(false);
                }
                return;
            }

            setPatientsLoading(true);
            const response = await fetchPatientsPaginated({
                page: 1,
                limit: 10,
                q: query,
                sortBy: "nom",
                sortDir: "asc",
            });

            if (!active) {
                return;
            }

            setPatientMatches(response.data?.data ?? []);
            setPatientsLoading(false);
        }

        void loadPatientMatches();
        return () => {
            active = false;
        };
    }, [debouncedPatientSearch, inputMode, isAuthenticated, selectedPatient]);

    function update<K extends keyof ClinicalPayload>(key: K, value: any) {
        setForm((prev) => ({ ...prev, [key]: value }));
    }

    function applyFormData(payload: ClinicalPayload) {
        const nextForm = clonePayload(payload);
        if (!nextForm.country && browserCountryCode) {
            nextForm.country = browserCountryCode;
        }
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
        applyFormData(EMPTY_FORM);
        setSelectedClinicalField("");
        setSelectedExampleCase("");
        setHasRestoredClinicalData(false);
        setIsDiabetesModalOpen(false);
    }

    async function selectPatient(patient: Patient) {
        const response = await fetchPatientById(patient._id);
        if ("error" in response) {
            setPatientSaveError(response.error.message);
            return;
        }

        const detail = response.data;
        setPatientSaveError("");
        setSelectedPatient(detail);
        setPatientSearch("");
        setPatientMatches([]);
        setSelectedClinicalField("");
        setSelectedExampleCase("");
        setHasRestoredClinicalData(false);
        setIsDiabetesModalOpen(false);
        applyFormData(buildPayloadFromPatientProfile(detail, browserCountryCode));
    }

    function returnToManualInput() {
        if (inputMode === "manual" && !selectedPatient) {
            return;
        }

        setInputMode("manual");
        setSelectedPatient(null);
        setPatientSearch("");
        setPatientMatches([]);
        setPatientSaveError("");
        resetPatient();
    }

    async function saveSelectedPatientParameters() {
        if (!selectedPatient) {
            return true;
        }

        setSavingPatientParameters(true);
        setPatientSaveError("");
        const response = await updatePatient(selectedPatient._id, {
            nom: selectedPatient.nom,
            prenom: selectedPatient.prenom,
            secure_request_profile: {
                ...(selectedPatient.secure_request_profile || {}),
                clinicalAnalysisParameters: clonePayload(form),
                lastRequestedAt: new Date().toISOString(),
            },
        });
        setSavingPatientParameters(false);

        if ("error" in response) {
            setPatientSaveError(
                response.error.code === "UNAPPROVED_CLINICAL_PROFILE_CONTENT"
                    ? patientSelectionLabels.unsafeProfileNotSaved
                    : response.error.message
            );
            return false;
        }

        setSelectedPatient(response.data);
        return true;
    }

    async function handleAnalyze() {
        const wasSaved = await saveSelectedPatientParameters();
        if (!wasSaved) {
            return;
        }

        await onSubmit(form);
    }

    function handleClinicalFieldChange(field: ClinicalField | "") {
        setSelectedClinicalField(field);
        setSelectedExampleCase("");
        setHasRestoredClinicalData(false);
        applyFormData(EMPTY_FORM);
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
    const reviewedStrings = getClinicalFormReviewedStrings(targetLang);
    const { translated: helpButtonLabel } = useTranslation({
        text: clinicalFormLabels.help.button,
        targetLang,
    });
    const { translated: inputModeHelpLabel } = useTranslation({
        text: clinicalFormLabels.help.inputMode,
        targetLang,
    });
    const { translated: patientSearchHelpLabel } = useTranslation({
        text: clinicalFormLabels.help.patientSearch,
        targetLang,
    });
    const { translated: clinicalFieldHelpTipLabel } = useTranslation({
        text: clinicalFormLabels.help.clinicalField,
        targetLang,
    });
    const { translated: diagnosisHelpTipLabel } = useTranslation({
        text: clinicalFormLabels.help.diagnosis,
        targetLang,
    });
    const { translated: analyzeHelpLabel } = useTranslation({
        text: clinicalFormLabels.help.analyze,
        targetLang,
    });


    // Traductions dynamiques
    const clinicalParametersTitleLabel = reviewedStrings.clinicalParametersTitle;
    const clinicalParametersHelpLabel = reviewedStrings.clinicalParametersHelp;
    const { translated: incompleteDataLabel } = useTranslation({ text: "Données cliniques incomplètes", targetLang });
    const { translated: exampleCaseTooltipLabel } = useTranslation({ text: commentLabels.exampleCaseTooltip, targetLang });
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
    const exampleCaseRequiredHintLabel = reviewedStrings.exampleCaseRequiredHint;
    const exampleCaseSelectionRequiredLabel =
        reviewedStrings.exampleCaseSelectionRequired;
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
    const { translated: comparisonLoadCaseOneLabel } = useTranslation({
        text: clinicalFormLabels.comparisonLoadCaseOne,
        targetLang,
    });
    const { translated: comparisonLoadCaseTwoLabel } = useTranslation({
        text: clinicalFormLabels.comparisonLoadCaseTwo,
        targetLang,
    });
    const { translated: comparisonLoadHelpLabel } = useTranslation({
        text: clinicalFormLabels.comparisonLoadHelp,
        targetLang,
    });
    const { translated: comparisonModalTitleCaseOneLabel } = useTranslation({
        text: clinicalFormLabels.comparisonModalTitleCaseOne,
        targetLang,
    });
    const { translated: comparisonModalTitleCaseTwoLabel } = useTranslation({
        text: clinicalFormLabels.comparisonModalTitleCaseTwo,
        targetLang,
    });
    const { translated: comparisonModalDescriptionLabel } = useTranslation({
        text: clinicalFormLabels.comparisonModalDescription,
        targetLang,
    });
    const { translated: comparisonModalSaveLabel } = useTranslation({
        text: clinicalFormLabels.comparisonModalSave,
        targetLang,
    });
    const { translated: comparisonMedicationLabel } = useTranslation({
        text: clinicalFormLabels.comparisonMedicationLabel,
        targetLang,
    });
    const { translated: comparisonMedicationHelpLabel } = useTranslation({
        text: clinicalFormLabels.comparisonMedicationHelp,
        targetLang,
    });
    const { translated: comparisonMedicationMetforminLabel } = useTranslation({
        text: clinicalFormLabels.comparisonMedicationOptions.metformin,
        targetLang,
    });
    const { translated: comparisonMedicationGliclazideLabel } = useTranslation({
        text: clinicalFormLabels.comparisonMedicationOptions.gliclazide,
        targetLang,
    });
    const { translated: comparisonMedicationEmpagliflozinLabel } = useTranslation({
        text: clinicalFormLabels.comparisonMedicationOptions.empagliflozin,
        targetLang,
    });
    const { translated: comparisonMedicationSitagliptinLabel } = useTranslation({
        text: clinicalFormLabels.comparisonMedicationOptions.sitagliptin,
        targetLang,
    });
    const { translated: comparisonMedicationSemaglutideLabel } = useTranslation({
        text: clinicalFormLabels.comparisonMedicationOptions.semaglutide,
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
    const { translated: diabetesParamsTitleLabel } = useTranslation({
        text: clinicalFormLabels.diabetesParamsTitle,
        targetLang,
    });
    const { translated: diabetesParamsOpenHintLabel } = useTranslation({
        text: clinicalFormLabels.diabetesParamsOpenHint,
        targetLang,
    });
    const { translated: diabetesParamsEditableHintLabel } = useTranslation({
        text: clinicalFormLabels.diabetesParamsEditableHint,
        targetLang,
    });
    const { translated: diabetesParamsAnalyzeHintLabel } = useTranslation({
        text: clinicalFormLabels.diabetesParamsAnalyzeHint,
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
    const hasSelectedExampleCase = Boolean(selectedExampleCase);
    const canAnalyze =
        hasSelectedExampleCase || Boolean(selectedPatient) || hasRestoredClinicalData;
    const patientSelectionLabels = labels.clinicalPatientSelection;
    const { translated: manualPatientEntryLabel } = useTranslation({
        text: patientSelectionLabels.manual,
        targetLang,
        translationKey: "clinicalPatientSelection.manual",
    });
    const { translated: existingPatientEntryLabel } = useTranslation({
        text: patientSelectionLabels.existingPatient,
        targetLang,
        translationKey: "clinicalPatientSelection.existingPatient",
    });
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
    const comparisonMedicationOptions = [
        comparisonMedicationMetforminLabel,
        comparisonMedicationGliclazideLabel,
        comparisonMedicationEmpagliflozinLabel,
        comparisonMedicationSitagliptinLabel,
        comparisonMedicationSemaglutideLabel,
    ];
    const clinicalFieldOptions: Array<{
        value: ClinicalField;
        label: string;
    }> = [
        {
            value: "generalMedicine",
            label: reviewedStrings.clinicalFields.generalMedicine,
        },
        { value: "oncology", label: reviewedStrings.clinicalFields.oncology },
        {
            value: "infectiousDiseases",
            label: reviewedStrings.clinicalFields.infectiousDiseases,
        },
        {
            value: "ophthalmology",
            label: reviewedStrings.clinicalFields.ophthalmology,
        },
        {
            value: "mentalHealth",
            label: reviewedStrings.clinicalFields.mentalHealth,
        },
        {
            value: "endocrinology",
            label: reviewedStrings.clinicalFields.endocrinology,
        },
    ];
    const exampleCaseOptions = [
        { value: "hypertension55", label: patient1Label },
        { value: "gastricCancer59", label: patient2Label },
        { value: "mononucleosis35", label: patient3Label },
        { value: "cataract72", label: patient4Label },
        { value: "majorDepression42", label: patient5Label },
        { value: "diabetesType255", label: patient6Label },
    ].filter(
        (option) => EXAMPLE_CASE_FIELDS[option.value] === selectedClinicalField
    );

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

    function openComparisonExampleCaseModal(caseKey: "one" | "two") {
        const payload =
            caseKey === "one" ? COMPARISON_CASE_ONE : COMPARISON_CASE_TWO;
        setComparisonJsonModalTarget(caseKey);
        setComparisonCaseEditor(buildComparisonCaseEditorState(payload));
    }

    function saveComparisonJsonModal() {
        if (!comparisonCaseEditor) {
            return;
        }
        const payload = buildClinicalPayloadFromComparisonCaseEditor(
            comparisonCaseEditor
        );
        const formatted = JSON.stringify(payload, null, 2);

        if (comparisonJsonModalTarget === "one") {
            setComparisonJsonCaseOne(formatted);
        } else if (comparisonJsonModalTarget === "two") {
            setComparisonJsonCaseTwo(formatted);
        }

        setComparisonJsonModalTarget(null);
        setComparisonCaseEditor(null);

        if (comparisonFeedback) {
            setComparisonFeedback(null);
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


            <div className="flex flex-col items-center justify-center gap-2 text-center">
                <h2 className="text-lg font-semibold text-gray-900">
                    {clinicalParametersTitleLabel}
                    <InfoTooltip label={helpButtonLabel}>{analyzeHelpLabel}</InfoTooltip>
                </h2>
                <p className="max-w-2xl text-sm leading-6 text-gray-600">
                    {clinicalParametersHelpLabel}
                </p>
                {canAnalyze ? (
                    <button
                        disabled={loading || savingPatientParameters}
                        onClick={() => void handleAnalyze()}
                        className="mt-1 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                        {loading || savingPatientParameters
                            ? analyzingButtonLabel
                            : analyzeButtonLabel}
                    </button>
                ) : null}
            </div>

            {isAuthenticated && (
                <div className="rounded border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap gap-2" role="group" aria-label={patientSelectionLabels.selected}>
                        <InfoTooltip label={helpButtonLabel}>{inputModeHelpLabel}</InfoTooltip>
                        <button
                            type="button"
                            onClick={returnToManualInput}
                            className={inputMode === "manual" ? "rounded border border-blue-700 bg-blue-700 px-3 py-2 text-sm font-medium text-white" : "rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"}
                        >
                            {manualPatientEntryLabel}
                        </button>
                        <button
                            type="button"
                            onClick={() => setInputMode("patient")}
                            className={inputMode === "patient" ? "rounded border border-blue-700 bg-blue-700 px-3 py-2 text-sm font-medium text-white" : "rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"}
                        >
                            {existingPatientEntryLabel}
                        </button>
                    </div>

                    {inputMode === "patient" && (
                        <div className="mt-4 max-w-xl space-y-2">
                            {selectedPatient ? (
                                <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-emerald-200 bg-emerald-50 p-3">
                                    <div>
                                        <p className="text-sm font-semibold text-emerald-950">
                                            {patientSelectionLabels.selected}: {selectedPatient.prenom} {selectedPatient.nom}
                                        </p>
                                        <p className="mt-1 text-xs text-emerald-900">
                                            {patientSelectionLabels.structuredOnly}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={returnToManualInput}
                                        className="rounded border border-emerald-400 bg-white px-3 py-2 text-sm font-medium text-emerald-900"
                                    >
                                        {patientSelectionLabels.clear}
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <label htmlFor="clinical-patient-search" className="text-sm font-medium text-gray-700">
                                        {patientSelectionLabels.searchLabel}
                                    </label>
                                    <InfoTooltip label={helpButtonLabel}>{patientSearchHelpLabel}</InfoTooltip>
                                    <input
                                        id="clinical-patient-search"
                                        className="input w-full"
                                        value={patientSearch}
                                        onChange={(event) => setPatientSearch(event.target.value)}
                                        placeholder={patientSelectionLabels.searchPlaceholder}
                                        autoComplete="off"
                                    />
                                    {patientsLoading && <p className="text-sm text-slate-600">{patientSelectionLabels.loading}</p>}
                                    {!patientsLoading && patientSearch.trim().length >= 2 && patientMatches.length === 0 && (
                                        <p className="text-sm text-slate-600">{patientSelectionLabels.empty}</p>
                                    )}
                                    {patientMatches.length > 0 && (
                                        <ul className="divide-y rounded border border-slate-200 bg-white">
                                            {patientMatches.map((patient) => (
                                                <li key={patient._id}>
                                                    <button
                                                        type="button"
                                                        onClick={() => selectPatient(patient)}
                                                        className="w-full px-3 py-2 text-left text-sm font-medium text-slate-900 hover:bg-slate-50"
                                                    >
                                                        {patient.prenom} {patient.nom}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </>
                            )}
                            {patientSaveError && (
                                <p className="text-sm text-red-700">{patientSaveError}</p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {inputMode !== "manual" ? null : (
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="w-full md:w-auto flex flex-col gap-3 md:flex-row md:items-end">
                    <div className="grid w-full gap-4 md:grid-cols-2">
                        <div className="w-full md:w-80 space-y-1">
                            <label htmlFor="clinical-field" className="text-sm font-medium text-gray-700">
                                {reviewedStrings.clinicalFieldLabel}
                            </label>
                            <InfoTooltip label={helpButtonLabel}>{clinicalFieldHelpTipLabel}</InfoTooltip>
                            <p className="text-xs text-gray-500">
                                {reviewedStrings.clinicalFieldHelp}
                            </p>
                            <select
                                id="clinical-field"
                                className="input w-full"
                                value={selectedClinicalField}
                                onChange={(e) =>
                                    handleClinicalFieldChange(
                                        e.target.value as ClinicalField | ""
                                    )
                                }
                            >
                                <option value="">
                                    {reviewedStrings.clinicalFieldPlaceholder}
                                </option>
                                {clinicalFieldOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="w-full md:w-80 space-y-1">
                        <label htmlFor="clinical-example-case" className="text-sm font-medium text-gray-700">
                            {reviewedStrings.exampleCaseLabel}
                        </label>
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            {exampleCaseRequiredHintLabel}
                        </p>
                        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                            {exampleCaseSelectionRequiredLabel}
                        </p>
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
                                disabled={!selectedClinicalField}
                                onChange={(e) => handleExampleCaseChange(e.target.value)}
                            >
                                <option value="">
                                    {reviewedStrings.exampleCasePlaceholder}
                                </option>
                                {exampleCaseOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    </div>
                    {hasSelectedExampleCase && isType2DiabetesContext() && (
                        <div className="w-full md:w-[30rem] rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm">
                            <p className="text-sm font-semibold text-emerald-950">
                                {diabetesParamsTitleLabel}
                            </p>
                            <p className="mt-1 text-sm text-emerald-900">
                                {diabetesParamsOpenHintLabel}
                            </p>
                            <p className="mt-1 text-xs text-emerald-800">
                                {diabetesParamsEditableHintLabel}
                            </p>
                            <p className="mt-1 text-xs text-emerald-800">
                                {diabetesParamsAnalyzeHintLabel}
                            </p>
                            <button
                                type="button"
                                onClick={openDiabetesModal}
                                className="mt-3 inline-flex w-full items-center justify-center rounded border border-emerald-400 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100 md:w-auto"
                            >
                                {diabetesModalButtonLabel}
                            </button>
                        </div>
                    )}
                </div>
            </div>
            )}

            {!canAnalyze ? null : (
                <>
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
                        maxLength={10000}
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
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
                                <p className="text-xs text-emerald-900">
                                    {comparisonLoadHelpLabel}
                                </p>
                                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                    <button
                                        type="button"
                                        onClick={() => openComparisonExampleCaseModal("one")}
                                        className="rounded border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100"
                                    >
                                        {comparisonLoadCaseOneLabel}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => openComparisonExampleCaseModal("two")}
                                        className="rounded border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100"
                                    >
                                        {comparisonLoadCaseTwoLabel}
                                    </button>
                                </div>
                            </div>
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
                            min={0}
                            max={130}
                            className="input w-full"
                            placeholder={reviewedStrings.agePlaceholder}
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
                    <InfoTooltip label={helpButtonLabel}>{diagnosisHelpTipLabel}</InfoTooltip>
                    <p className="text-xs text-gray-500">
                        {diagnosisHelpLabel}
                    </p>
                    <input
                        id="clinical-diagnosis"
                        className="input w-full"
                        maxLength={160}
                        placeholder={reviewedStrings.diagnosisPlaceholder}
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
                            min={0.5}
                            max={500}
                            step="any"
                            className="input w-full"
                            placeholder={reviewedStrings.weightPlaceholder}
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
                            min={20}
                            max={300}
                            step="any"
                            className="input w-full"
                            placeholder={reviewedStrings.heightPlaceholder}
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
                        maxLength={725}
                        placeholder={reviewedStrings.symptomsPlaceholder}
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
                        maxLength={725}
                        placeholder={reviewedStrings.medicalHistoryPlaceholder}
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
                        maxLength={725}
                        placeholder={reviewedStrings.medicationsPlaceholder}
                        value={listInputs.current_medications}
                        onChange={(e) =>
                            updateListField("current_medications", e.target.value)
                        }
                    />
                </div>
            </Field>

            <div className="flex gap-3">
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
            {comparisonJsonModalTarget ? (
                <div
                    className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 px-4"
                    aria-modal="true"
                    role="dialog"
                >
                    <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
                        <h2 className="text-lg font-semibold text-gray-900">
                            {comparisonJsonModalTarget === "one"
                                ? comparisonModalTitleCaseOneLabel
                                : comparisonModalTitleCaseTwoLabel}
                        </h2>
                        <p className="mt-2 text-sm text-gray-600">
                            {comparisonModalDescriptionLabel}
                        </p>
                        {comparisonCaseEditor ? (
                            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                                <label className="space-y-1 text-sm text-gray-700">
                                    <span className="font-medium">{ageLabel}</span>
                                    <input
                                        type="number"
                                        className="input w-full"
                                        value={comparisonCaseEditor.age}
                                        onChange={(e) =>
                                            setComparisonCaseEditor((prev) =>
                                                prev
                                                    ? { ...prev, age: e.target.value }
                                                    : prev
                                            )
                                        }
                                    />
                                </label>
                                <label className="space-y-1 text-sm text-gray-700">
                                    <span className="font-medium">{sexLabel}</span>
                                    <select
                                        className="input w-full"
                                        value={comparisonCaseEditor.sex}
                                        onChange={(e) =>
                                            setComparisonCaseEditor((prev) =>
                                                prev
                                                    ? {
                                                          ...prev,
                                                          sex: e.target.value as Sex,
                                                      }
                                                    : prev
                                            )
                                        }
                                    >
                                        {sexOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="space-y-1 text-sm text-gray-700">
                                    <span className="font-medium">{countryLabel}</span>
                                    <select
                                        className="input w-full"
                                        value={comparisonCaseEditor.country}
                                        onChange={(e) =>
                                            setComparisonCaseEditor((prev) =>
                                                prev
                                                    ? { ...prev, country: e.target.value }
                                                    : prev
                                            )
                                        }
                                    >
                                        <option value="">{countryPlaceholderLabel}</option>
                                        {countryOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="space-y-1 text-sm text-gray-700">
                                    <span className="font-medium">{ethnicityLabel}</span>
                                    <select
                                        className="input w-full"
                                        value={comparisonCaseEditor.ethnicity}
                                        onChange={(e) =>
                                            setComparisonCaseEditor((prev) =>
                                                prev
                                                    ? {
                                                          ...prev,
                                                          ethnicity:
                                                              e.target.value as PatientEthnicity,
                                                      }
                                                    : prev
                                            )
                                        }
                                    >
                                        {ethnicityOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="space-y-1 text-sm text-gray-700 md:col-span-2">
                                    <span className="font-medium">{diagnosisLabel}</span>
                                    <input
                                        className="input w-full"
                                        value={comparisonCaseEditor.diagnosis}
                                        onChange={(e) =>
                                            setComparisonCaseEditor((prev) =>
                                                prev
                                                    ? { ...prev, diagnosis: e.target.value }
                                                    : prev
                                            )
                                        }
                                    />
                                </label>
                                <label className="space-y-1 text-sm text-gray-700 md:col-span-2">
                                    <span className="font-medium">{symptomsLabel}</span>
                                    <input
                                        className="input w-full"
                                        value={comparisonCaseEditor.symptoms}
                                        onChange={(e) =>
                                            setComparisonCaseEditor((prev) =>
                                                prev
                                                    ? { ...prev, symptoms: e.target.value }
                                                    : prev
                                            )
                                        }
                                    />
                                </label>
                                <label className="space-y-1 text-sm text-gray-700 md:col-span-2">
                                    <span className="font-medium">{medicalHistoryLabel}</span>
                                    <input
                                        className="input w-full"
                                        value={comparisonCaseEditor.medical_history}
                                        onChange={(e) =>
                                            setComparisonCaseEditor((prev) =>
                                                prev
                                                    ? {
                                                          ...prev,
                                                          medical_history: e.target.value,
                                                      }
                                                    : prev
                                            )
                                        }
                                    />
                                </label>
                                <label className="space-y-1 text-sm text-gray-700 md:col-span-2">
                                    <span className="font-medium">{comparisonMedicationLabel}</span>
                                    <span className="block text-xs text-gray-500">
                                        {comparisonMedicationHelpLabel}
                                    </span>
                                    <select
                                        className="input min-h-32 w-full"
                                        multiple
                                        value={comparisonCaseEditor.current_medications}
                                        onChange={(e) =>
                                            setComparisonCaseEditor((prev) =>
                                                prev
                                                    ? {
                                                          ...prev,
                                                          current_medications: Array.from(
                                                              e.target.selectedOptions,
                                                              (option) => option.value
                                                          ),
                                                      }
                                                    : prev
                                            )
                                        }
                                    >
                                        {comparisonMedicationOptions.map((option) => (
                                            <option key={option} value={option}>
                                                {option}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="space-y-1 text-sm text-gray-700">
                                    <span className="font-medium">{cardiovascularRiskLabel}</span>
                                    <input
                                        className="input w-full"
                                        value={comparisonCaseEditor.cardiovascular_risk}
                                        onChange={(e) =>
                                            setComparisonCaseEditor((prev) =>
                                                prev
                                                    ? {
                                                          ...prev,
                                                          cardiovascular_risk: e.target.value,
                                                      }
                                                    : prev
                                            )
                                        }
                                    />
                                </label>
                                <label className="space-y-1 text-sm text-gray-700">
                                    <span className="font-medium">{renalFunctionLabel}</span>
                                    <input
                                        className="input w-full"
                                        value={comparisonCaseEditor.renal_function}
                                        onChange={(e) =>
                                            setComparisonCaseEditor((prev) =>
                                                prev
                                                    ? {
                                                          ...prev,
                                                          renal_function: e.target.value,
                                                      }
                                                    : prev
                                            )
                                        }
                                    />
                                </label>
                                <label className="space-y-1 text-sm text-gray-700">
                                    <span className="font-medium">{fragilityLabel}</span>
                                    <input
                                        className="input w-full"
                                        value={comparisonCaseEditor.fragility}
                                        onChange={(e) =>
                                            setComparisonCaseEditor((prev) =>
                                                prev
                                                    ? { ...prev, fragility: e.target.value }
                                                    : prev
                                            )
                                        }
                                    />
                                </label>
                                <label className="space-y-1 text-sm text-gray-700">
                                    <span className="font-medium">{toleranceLabel}</span>
                                    <input
                                        className="input w-full"
                                        value={comparisonCaseEditor.tolerance}
                                        onChange={(e) =>
                                            setComparisonCaseEditor((prev) =>
                                                prev
                                                    ? { ...prev, tolerance: e.target.value }
                                                    : prev
                                            )
                                        }
                                    />
                                </label>
                                <label className="space-y-1 text-sm text-gray-700 md:col-span-2">
                                    <span className="font-medium">{glycemicGoalsLabel}</span>
                                    <input
                                        className="input w-full"
                                        value={comparisonCaseEditor.glycemic_goals}
                                        onChange={(e) =>
                                            setComparisonCaseEditor((prev) =>
                                                prev
                                                    ? {
                                                          ...prev,
                                                          glycemic_goals: e.target.value,
                                                      }
                                                    : prev
                                            )
                                        }
                                    />
                                </label>
                            </div>
                        ) : null}
                        <div className="mt-6 flex gap-3">
                            <button
                                type="button"
                                onClick={saveComparisonJsonModal}
                                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                            >
                                {comparisonModalSaveLabel}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setComparisonJsonModalTarget(null);
                                    setComparisonCaseEditor(null);
                                }}
                                className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                {cancelLabel}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
                </>
            )}
        </div>
    );
}
