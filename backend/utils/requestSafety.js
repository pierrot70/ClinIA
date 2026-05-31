const MAX_STRING_LENGTH = 2000;
const MAX_CLOUD_LIST_ITEMS = 8;
const MAX_CLOUD_ITEM_LENGTH = 120;
const MAX_CLOUD_TEXT_LENGTH = 160;

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

function clampCloudString(value, maxLength = MAX_CLOUD_TEXT_LENGTH) {
    if (typeof value !== "string") {
        return "";
    }

    return sanitizeString(value).slice(0, maxLength).trim();
}

function compactStringList(values, maxItems = MAX_CLOUD_LIST_ITEMS) {
    if (!Array.isArray(values)) {
        return [];
    }

    return values
        .map((value) => clampCloudString(String(value ?? ""), MAX_CLOUD_ITEM_LENGTH))
        .filter(Boolean)
        .slice(0, maxItems);
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

export function buildCloudSafePatientPayload(payload = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return {};
    }

    const safePayload = {};
    const diagnosis = clampCloudString(payload.diagnosis);
    const sex = clampCloudString(payload.sex, 32);
    const ageBand = toAgeBand(payload.age);
    const weightBand = toWeightBand(payload.weight);
    const symptoms = compactStringList(payload.symptoms, 6);
    const medicalHistory = compactStringList(payload.medical_history, 6);
    const currentMedications = compactStringList(payload.current_medications, 6);

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
        const cardiovascularRisk = clampCloudString(
            diabetesContext.cardiovascular_risk,
            80
        );
        const renalFunction = clampCloudString(diabetesContext.renal_function, 80);
        const fragility = clampCloudString(diabetesContext.fragility, 80);
        const tolerance = clampCloudString(diabetesContext.tolerance, 80);
        const glycemicGoals = clampCloudString(diabetesContext.glycemic_goals, 120);

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
