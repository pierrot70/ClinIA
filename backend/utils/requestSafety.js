const MAX_STRING_LENGTH = 2000;
const ANALYZE_REQUEST_FIELDS = new Set([
    "age",
    "sex",
    "country",
    "ethnicity",
    "diagnosis",
    "weight",
    "height",
    "blood_pressure",
    "symptoms",
    "medical_history",
    "current_medications",
    "diabetes_context",
    // Request controls are accepted here but excluded from the clinical
    // fingerprint and cloud payload by their respective services.
    "forceReal",
    "openaiModel",
    "reverifyRequested",
    "incidentAckId",
]);
const BLOOD_PRESSURE_FIELDS = new Set(["systolic", "diastolic"]);
const DIABETES_CONTEXT_FIELDS = new Set([
    "cardiovascular_risk",
    "renal_function",
    "fragility",
    "tolerance",
    "glycemic_goals",
]);
export const CLINICAL_INPUT_LIMITS = Object.freeze({
    diagnosis: 160,
    listItem: 120,
    listItems: 6,
    age: { min: 0, max: 130 },
    weight: { min: 0.5, max: 500 },
    height: { min: 20, max: 300 },
    systolic: { min: 20, max: 300 },
    diastolic: { min: 20, max: 200 },
    diabetesContextValue: 120,
    clinicalNotes: 10000,
    profileText: 500,
    profileMedications: 1000,
    selectedDocumentIds: 20,
    selectedDocumentId: 128,
});
const APPROVED_AGE_BANDS = new Set([
    "<18",
    "18-19",
    "20-29",
    "30-39",
    "40-49",
    "50-59",
    "60-69",
    "70-79",
    "80-89",
    "90+",
]);
const APPROVED_WEIGHT_BANDS = new Set([
    "<60kg",
    "60-79kg",
    "80-99kg",
    "100kg+",
]);

const APPROVED_CLOUD_CLINICAL_TERMS = {
    diagnosis: [
        ["Migraine", ["migraine"]],
        ["Arterial hypertension", ["hypertension", "hypertension arterielle", "suspected hypertension", "suspicion d hypertension"]],
        ["Gastric cancer", ["gastric cancer", "cancer de l estomac", "cancer gastrique"]],
        ["Infectious mononucleosis", ["infectious mononucleosis", "mononucleose", "mononucleose infectieuse"]],
        ["Cataract", ["cataract", "cataracte"]],
        ["Major depressive disorder", ["major depressive disorder", "trouble depressif majeur"]],
        ["Type 2 diabetes", ["type 2 diabetes", "diabetes type 2", "diabete type 2", "diabete de type 2"]],
    ],
    symptoms: [
        ["Headache", ["headache", "cephalee"]],
        ["Elevated blood pressure", ["elevated blood pressure", "pression arterielle elevee"]],
        ["Epigastric pain", ["epigastric pain", "douleur epigastrique"]],
        ["Weight loss", ["weight loss", "perte de poids"]],
        ["Nausea", ["nausea", "nausees"]],
        ["Severe fatigue", ["severe fatigue", "fatigue intense"]],
        ["Fatigue", ["fatigue"]],
        ["Fever", ["fever", "fievre"]],
        ["Cervical lymphadenopathy", ["cervical lymphadenopathy", "adenopathies cervicales"]],
        ["Progressive blurred vision", ["progressive blurred vision", "vision floue progressive"]],
        ["Glare", ["glare", "eblouissements"]],
        ["Reduced visual acuity", ["reduced visual acuity", "baisse de l acuite visuelle"]],
        ["Depressed mood", ["depressed mood", "humeur depressive"]],
        ["Insomnia", ["insomnia", "insomnie"]],
        ["Loss of interest", ["loss of interest", "perte d interet"]],
        ["Polydipsia", ["polydipsia", "polydipsie"]],
        ["Polyuria", ["polyuria", "polyurie"]],
        [
            "Urinary retention",
            [
                "urinary retention",
                "retention urinaire",
                "impossible d uriner",
                "incapable d uriner",
            ],
        ],
        ["Persistent hyperglycemia", ["persistent hyperglycemia", "hyperglycemie persistante"]],
        ["Progressive weight gain", ["progressive weight gain", "prise de poids progressive"]],
    ],
    medical_history: [
        ["Asthma", ["asthma", "asthme"]],
        ["Hypertension", ["hypertension", "hypertension arterielle"]],
        ["Dyslipidemia", ["dyslipidemia", "dyslipidemie"]],
        ["Chronic kidney disease", ["chronic kidney disease", "insuffisance renale chronique"]],
        ["Anemia", ["anemia", "anemie"]],
        ["Type 2 diabetes", ["type 2 diabetes", "diabete de type 2"]],
        ["Generalized anxiety", ["generalized anxiety", "anxiete generalisee"]],
        ["Atherosclerotic cardiovascular disease", ["atherosclerotic cardiovascular disease", "maladie cardiovasculaire aterosclerotique"]],
    ],
    current_medications: [
        ["None", ["none", "aucune", "aucun"]],
        ["Metformin", ["metformin", "metformine"]],
        ["Empagliflozin", ["empagliflozin", "empagliflozine"]],
        ["Pantoprazole", ["pantoprazole"]],
    ],
};

const APPROVED_DIABETES_CONTEXT = {
    cardiovascular_risk: ["low", "moderate", "high", "modere a eleve", "eleve"],
    renal_function: ["preserved", "mild impairment", "preservee ou legerement reduite", "legere atteinte"],
    fragility: ["low", "moderate", "high", "faible"],
    tolerance: ["good", "bonne", "bonne tolerance a la metformine", "bonne tolerance a la combinaison actuelle"],
    glycemic_goals: ["hba1c < 7 %", "hba1c < 7 % si securitaire et realiste"],
};

const PROMPT_INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?previous\s+instructions?/i,
    /disregard\s+(all\s+)?(prior|previous)\s+instructions?/i,
    /system\s*prompt/i,
    /you\s+are\s+now\s+/i,
    /reveal\s+(the\s+)?(system|hidden)\s+prompt/i,
    /developer\s+message/i,
    /jailbreak/i,
];

function isBlockedKey(key) {
    if (typeof key !== "string") {
        return true;
    }

    if (key === "__proto__" || key === "constructor" || key === "prototype") {
        return true;
    }

    return key.startsWith("$") || key.includes(".");
}

function sanitizeString(value) {
    const asString = String(value ?? "").slice(0, MAX_STRING_LENGTH);

    return asString
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/javascript:/gi, "")
        .replace(/on[a-z]+\s*=\s*["'][^"']*["']/gi, "")
        .trim();
}

function normalizeClinicalCatalogValue(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\p{Cf}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9%<]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

function buildClinicalCatalog(entries) {
    const catalog = new Map();
    for (const [canonicalValue, aliases] of entries) {
        catalog.set(
            normalizeClinicalCatalogValue(canonicalValue),
            canonicalValue
        );
        for (const alias of aliases) {
            catalog.set(normalizeClinicalCatalogValue(alias), canonicalValue);
        }
    }
    return catalog;
}

const CLINICAL_CATALOGS = Object.fromEntries(
    Object.entries(APPROVED_CLOUD_CLINICAL_TERMS).map(([field, entries]) => [
        field,
        buildClinicalCatalog(entries),
    ])
);

// The UI needs aliases only to avoid presenting a duplicate concept after a
// clinician used a different approved spelling. They are all controlled terms.
export function getStaticApprovedClinicalTerms(field = "symptoms") {
    return (APPROVED_CLOUD_CLINICAL_TERMS[field] ?? []).map(
        ([canonicalValue, aliases]) => ({ field, canonicalValue, aliases: [canonicalValue, ...aliases] })
    );
}

function getDynamicClinicalCatalog(entries = []) {
    const catalog = new Map();
    for (const entry of entries) {
        if (!entry || entry.field !== "symptoms" || typeof entry.canonicalValue !== "string") {
            continue;
        }
        const canonicalValue = entry.canonicalValue;
        catalog.set(normalizeClinicalCatalogValue(canonicalValue), canonicalValue);
        for (const alias of Array.isArray(entry.aliases) ? entry.aliases : []) {
            catalog.set(normalizeClinicalCatalogValue(alias), canonicalValue);
        }
    }
    return catalog;
}

function getApprovedClinicalValue(field, value, dynamicTerms = []) {
    if (typeof value !== "string") {
        return "";
    }
    const normalized = normalizeClinicalCatalogValue(value);
    return CLINICAL_CATALOGS[field]?.get(normalized) ??
        getDynamicClinicalCatalog(dynamicTerms).get(normalized) ?? "";
}

function buildApprovedClinicalList(field, values, maxItems, dynamicTerms = []) {
    if (!Array.isArray(values)) {
        return { approved: [], rejectedCount: 0 };
    }

    const approved = [];
    let rejectedCount = 0;
    for (const value of values.slice(0, maxItems)) {
        const mapped = getApprovedClinicalValue(field, value, dynamicTerms);
        if (mapped) {
            if (!approved.includes(mapped)) approved.push(mapped);
        } else if (String(value ?? "").trim()) {
            rejectedCount += 1;
        }
    }
    return { approved, rejectedCount };
}

function getApprovedContextValue(field, value) {
    const normalized = normalizeClinicalCatalogValue(value);
    return APPROVED_DIABETES_CONTEXT[field]?.includes(normalized)
        ? normalized
        : "";
}

function sanitizeNode(node) {
    if (node === null || node === undefined) {
        return node;
    }

    if (typeof node === "string") {
        return sanitizeString(node);
    }

    if (typeof node === "number" || typeof node === "boolean") {
        return node;
    }

    if (Array.isArray(node)) {
        return node.map((item) => sanitizeNode(item));
    }

    if (typeof node === "object") {
        const out = {};
        for (const [key, value] of Object.entries(node)) {
            if (isBlockedKey(key)) {
                continue;
            }
            out[key] = sanitizeNode(value);
        }
        return out;
    }

    return undefined;
}

function collectStrings(node, into) {
    if (typeof node === "string") {
        into.push(node);
        return;
    }

    if (Array.isArray(node)) {
        for (const item of node) {
            collectStrings(item, into);
        }
        return;
    }

    if (node && typeof node === "object") {
        for (const value of Object.values(node)) {
            collectStrings(value, into);
        }
    }
}

export function sanitizeRequestPayload(payload) {
    return sanitizeNode(payload);
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectUnknownFields(payload, allowedFields, prefix = "") {
    if (!isPlainObject(payload)) return [];

    return Object.keys(payload)
        .filter((field) => !allowedFields.has(field))
        .map((field) => `${prefix}${field}`);
}

/**
 * Defines the complete public DTO accepted by POST /api/ai/analyze.
 * Unknown fields are rejected instead of being carried into cache keys or
 * diagnosis persistence.
 */
export function validateAnalyzeRequestShape(payload = {}) {
    if (!isPlainObject(payload)) {
        return { valid: false, invalidFields: ["payload"] };
    }

    const invalidFields = collectUnknownFields(
        payload,
        ANALYZE_REQUEST_FIELDS
    );

    if (payload.blood_pressure !== undefined && payload.blood_pressure !== null) {
        if (!isPlainObject(payload.blood_pressure)) {
            addInvalidField(invalidFields, "blood_pressure");
        } else {
            for (const field of collectUnknownFields(
                payload.blood_pressure,
                BLOOD_PRESSURE_FIELDS,
                "blood_pressure."
            )) {
                addInvalidField(invalidFields, field);
            }
        }
    }

    if (payload.diabetes_context !== undefined && payload.diabetes_context !== null) {
        if (!isPlainObject(payload.diabetes_context)) {
            addInvalidField(invalidFields, "diabetes_context");
        } else {
            for (const field of collectUnknownFields(
                payload.diabetes_context,
                DIABETES_CONTEXT_FIELDS,
                "diabetes_context."
            )) {
                addInvalidField(invalidFields, field);
            }
        }
    }

    return { valid: invalidFields.length === 0, invalidFields };
}

function addInvalidField(invalidFields, field) {
    if (!invalidFields.includes(field)) invalidFields.push(field);
}

function validateOptionalString(value, field, maxLength, invalidFields) {
    if (value === undefined || value === null || value === "") return;
    if (typeof value !== "string" || value.length > maxLength) {
        addInvalidField(invalidFields, field);
    }
}

function validateOptionalNumber(value, field, bounds, invalidFields) {
    if (value === undefined || value === null || value === "") return;
    if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < bounds.min ||
        value > bounds.max
    ) {
        addInvalidField(invalidFields, field);
    }
}

function validateClinicalList(value, field, invalidFields) {
    if (value === undefined || value === null) return;
    if (!Array.isArray(value) || value.length > CLINICAL_INPUT_LIMITS.listItems) {
        addInvalidField(invalidFields, field);
        return;
    }
    for (const entry of value) {
        if (
            typeof entry !== "string" ||
            entry.trim().length === 0 ||
            entry.length > CLINICAL_INPUT_LIMITS.listItem
        ) {
            addInvalidField(invalidFields, field);
            return;
        }
    }
}

export function validateClinicalInputBounds(payload = {}) {
    const invalidFields = [];
    if (!isPlainObject(payload)) {
        return { valid: false, invalidFields: ["payload"] };
    }

    validateOptionalString(payload.diagnosis, "diagnosis", CLINICAL_INPUT_LIMITS.diagnosis, invalidFields);
    validateOptionalNumber(payload.age, "age", CLINICAL_INPUT_LIMITS.age, invalidFields);
    validateOptionalNumber(payload.weight, "weight", CLINICAL_INPUT_LIMITS.weight, invalidFields);
    validateOptionalNumber(payload.height, "height", CLINICAL_INPUT_LIMITS.height, invalidFields);
    for (const field of ["symptoms", "medical_history", "current_medications"]) {
        validateClinicalList(payload[field], field, invalidFields);
    }

    if (payload.blood_pressure !== undefined && payload.blood_pressure !== null) {
        if (!isPlainObject(payload.blood_pressure)) {
            addInvalidField(invalidFields, "blood_pressure");
        } else {
            validateOptionalNumber(payload.blood_pressure.systolic, "blood_pressure.systolic", CLINICAL_INPUT_LIMITS.systolic, invalidFields);
            validateOptionalNumber(payload.blood_pressure.diastolic, "blood_pressure.diastolic", CLINICAL_INPUT_LIMITS.diastolic, invalidFields);
        }
    }

    if (payload.diabetes_context !== undefined && payload.diabetes_context !== null) {
        if (!isPlainObject(payload.diabetes_context)) {
            addInvalidField(invalidFields, "diabetes_context");
        } else {
            for (const field of Object.keys(APPROVED_DIABETES_CONTEXT)) {
                validateOptionalString(payload.diabetes_context[field], `diabetes_context.${field}`, CLINICAL_INPUT_LIMITS.diabetesContextValue, invalidFields);
            }
        }
    }

    return { valid: invalidFields.length === 0, invalidFields };
}

export function validateClinicalProfileBounds(profile) {
    const invalidFields = [];
    if (profile === undefined || profile === null) return { valid: true, invalidFields };
    if (!isPlainObject(profile)) {
        return { valid: false, invalidFields: ["secure_request_profile"] };
    }

    for (const field of ["objective", "sex", "age", "clinicalScope", "ageGroup", "symptomProfile", "cancerType", "duration", "severity", "redFlagStatus", "comorbidityContext"]) {
        validateOptionalString(profile[field], `secure_request_profile.${field}`, CLINICAL_INPUT_LIMITS.profileText, invalidFields);
    }
    validateOptionalString(profile.current_medications, "secure_request_profile.current_medications", CLINICAL_INPUT_LIMITS.profileMedications, invalidFields);
    validateOptionalString(profile.clinicalNotes, "secure_request_profile.clinicalNotes", CLINICAL_INPUT_LIMITS.clinicalNotes, invalidFields);

    if (profile.selected_document_ids !== undefined && profile.selected_document_ids !== null) {
        if (
            !Array.isArray(profile.selected_document_ids) ||
            profile.selected_document_ids.length > CLINICAL_INPUT_LIMITS.selectedDocumentIds ||
            profile.selected_document_ids.some((value) => typeof value !== "string" || value.length === 0 || value.length > CLINICAL_INPUT_LIMITS.selectedDocumentId)
        ) {
            addInvalidField(invalidFields, "secure_request_profile.selected_document_ids");
        }
    }

    if (
        profile.clinicalAnalysisParameters !== undefined &&
        profile.clinicalAnalysisParameters !== null
    ) {
        const parameterBounds = validateClinicalInputBounds(
            profile.clinicalAnalysisParameters
        );
        for (const field of parameterBounds.invalidFields) {
            addInvalidField(
                invalidFields,
                field === "payload"
                    ? "secure_request_profile.clinicalAnalysisParameters"
                    : `secure_request_profile.clinicalAnalysisParameters.${field}`
            );
        }
    }
    return { valid: invalidFields.length === 0, invalidFields };
}

function toAgeBand(age) {
    const numericAge = Number(age);
    if (!Number.isFinite(numericAge) || numericAge <= 0) {
        return null;
    }

    if (numericAge < 18) {
        return "<18";
    }

    if (numericAge >= 90) {
        return "90+";
    }

    const lowerBound = Math.floor(numericAge / 10) * 10;
    return `${lowerBound}-${lowerBound + 9}`;
}

function toWeightBand(weight) {
    const numericWeight = Number(weight);
    if (!Number.isFinite(numericWeight) || numericWeight <= 0) {
        return null;
    }

    if (numericWeight < 60) {
        return "<60kg";
    }

    if (numericWeight < 80) {
        return "60-79kg";
    }

    if (numericWeight < 100) {
        return "80-99kg";
    }

    return "100kg+";
}

export function buildCloudSafePatientPayload(payload = {}, { dynamicTerms = [] } = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return {};
    }

    const safePayload = {};
    const diagnosis = getApprovedClinicalValue("diagnosis", payload.diagnosis, dynamicTerms);
    const sex = ["male", "female", "other"].includes(payload.sex)
        ? payload.sex
        : "";
    const ageBand =
        toAgeBand(payload.age) ||
        (APPROVED_AGE_BANDS.has(payload.age_band) ? payload.age_band : null);
    const weightBand =
        toWeightBand(payload.weight) ||
        (APPROVED_WEIGHT_BANDS.has(payload.weight_band)
            ? payload.weight_band
            : null);
    const symptoms = buildApprovedClinicalList("symptoms", payload.symptoms, 6, dynamicTerms).approved;
    const medicalHistory = buildApprovedClinicalList(
        "medical_history",
        payload.medical_history,
        6,
        dynamicTerms
    ).approved;
    const currentMedications = buildApprovedClinicalList(
        "current_medications",
        payload.current_medications,
        6,
        dynamicTerms
    ).approved;

    if (diagnosis) {
        safePayload.diagnosis = diagnosis;
    }

    if (sex) {
        safePayload.sex = sex;
    }

    if (ageBand) {
        safePayload.age_band = ageBand;
    }

    if (symptoms.length > 0) {
        safePayload.symptoms = symptoms;
    }

    if (medicalHistory.length > 0) {
        safePayload.medical_history = medicalHistory;
    }

    if (currentMedications.length > 0) {
        safePayload.current_medications = currentMedications;
    }

    const diabetesContext = payload.diabetes_context;
    if (diabetesContext && typeof diabetesContext === "object" && !Array.isArray(diabetesContext)) {
        const safeContext = {};
        const cardiovascularRisk = getApprovedContextValue(
            "cardiovascular_risk",
            diabetesContext.cardiovascular_risk
        );
        const renalFunction = getApprovedContextValue(
            "renal_function",
            diabetesContext.renal_function
        );
        const fragility = getApprovedContextValue("fragility", diabetesContext.fragility);
        const tolerance = getApprovedContextValue("tolerance", diabetesContext.tolerance);
        const glycemicGoals = getApprovedContextValue(
            "glycemic_goals",
            diabetesContext.glycemic_goals
        );

        if (cardiovascularRisk) {
            safeContext.cardiovascular_risk = cardiovascularRisk;
        }

        if (renalFunction) {
            safeContext.renal_function = renalFunction;
        }

        if (fragility) {
            safeContext.fragility = fragility;
        }

        if (tolerance) {
            safeContext.tolerance = tolerance;
        }

        if (glycemicGoals) {
            safeContext.glycemic_goals = glycemicGoals;
        }

        if (Object.keys(safeContext).length > 0) {
            safePayload.diabetes_context = safeContext;
        }
    }

    if (weightBand) {
        safePayload.weight_band = weightBand;
    }

    return safePayload;
}

export function assessCloudClinicalPayload(payload = {}, { dynamicTerms = [] } = {}) {
    const rejectedFields = [];
    const diagnosisInput = String(payload?.diagnosis ?? "").trim();
    const diagnosis = getApprovedClinicalValue("diagnosis", diagnosisInput, dynamicTerms);
    if (diagnosisInput && !diagnosis) {
        rejectedFields.push("diagnosis");
    }

    for (const [field, maxItems] of [
        ["symptoms", 6],
        ["medical_history", 6],
        ["current_medications", 6],
    ]) {
        const assessment = buildApprovedClinicalList(field, payload?.[field], maxItems, dynamicTerms);
        if (
            assessment.rejectedCount > 0 ||
            (Array.isArray(payload?.[field]) && payload[field].length > maxItems)
        ) {
            rejectedFields.push(field);
        }
    }

    const diabetesContext = payload?.diabetes_context;
    if (diabetesContext && typeof diabetesContext === "object" && !Array.isArray(diabetesContext)) {
        for (const field of Object.keys(APPROVED_DIABETES_CONTEXT)) {
            const value = diabetesContext[field];
            if (String(value ?? "").trim() && !getApprovedContextValue(field, value)) {
                rejectedFields.push(`diabetes_context.${field}`);
            }
        }
    }

    const cloudPayload = buildCloudSafePatientPayload(payload, { dynamicTerms });
    const hasPrimaryClinicalConcept = Boolean(
        cloudPayload.diagnosis || cloudPayload.symptoms?.length
    );

    return {
        approved: rejectedFields.length === 0 && hasPrimaryClinicalConcept,
        rejectedFields: Array.from(new Set(rejectedFields)),
        cloudPayload,
        primaryConcern:
            cloudPayload.diagnosis || cloudPayload.symptoms?.[0] || "",
    };
}

export function detectPromptInjection(payload) {
    const values = [];
    collectStrings(payload, values);

    for (const value of values) {
        for (const pattern of PROMPT_INJECTION_PATTERNS) {
            if (pattern.test(value)) {
                return {
                    hasMatch: true,
                    pattern: pattern.source,
                };
            }
        }
    }

    return {
        hasMatch: false,
        pattern: null,
    };
}
