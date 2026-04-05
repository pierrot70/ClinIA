const DEFAULT_DIAGNOSIS_SUSPECTED = "Analyse clinique en cours";
const DEFAULT_DIAGNOSIS_CERTAINTY = "moderate";
const DEFAULT_DIAGNOSIS_JUSTIFICATION =
    "Analyse basée sur données cliniques disponibles.";
const DEFAULT_PATIENT_SUMMARY_PLAIN = "Résumé patient généré par ClinIA.";
const DEFAULT_PATIENT_SUMMARY_CLINICAL = "Analyse clinique structurée.";
const DEFAULT_CONFIDENCE_SCORE = 0.6;

const STANDARD_KEYS = new Set([
    "diagnosis",
    "treatments",
    "alternatives",
    "red_flags",
    "patient_summary",
    "meta",
]);

const KNOWN_AI_FIELDS = [
    "clinical_summary",
    "recommendations",
    "initial_evaluation_recommendations",
    "treatment_options",
    "follow_up_and_monitoring",
    "supportive_care",
    "follow_up_and_supportive_care",
];

function hasMeaningfulValue(value) {
    if (typeof value === "string") {
        return value.trim().length > 0;
    }

    if (Array.isArray(value)) {
        return value.some((entry) => hasMeaningfulValue(entry));
    }

    if (value && typeof value === "object") {
        return Object.values(value).some((entry) => hasMeaningfulValue(entry));
    }

    return value !== null && value !== undefined;
}

function toStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean);
}

function buildTreatmentFromString(name, extras = {}) {
    return {
        name: String(name || "Traitement non spécifié").trim() || "Traitement non spécifié",
        indication: extras.indication ?? "",
        dosage: extras.dosage ?? "",
        duration: extras.duration ?? "",
        contraindications: toStringArray(extras.contraindications),
        monitoring: toStringArray(extras.monitoring),
        evidence_level: extras.evidence_level ?? "C",
    };
}

function flattenTherapeuticOptions(therapeuticOptions, context = {}) {
    if (!therapeuticOptions || typeof therapeuticOptions !== "object") {
        return [];
    }

    const treatments = [];
    const fallbackContraindications = toStringArray(
        context.contraindications
            ? Object.values(context.contraindications)
            : []
    );
    const fallbackMonitoring = toStringArray(
        context.monitoring_considerations
            ? Object.values(context.monitoring_considerations)
            : []
    );

    if (Array.isArray(therapeuticOptions.lifestyle_modifications)) {
        for (const item of therapeuticOptions.lifestyle_modifications) {
            if (typeof item === "string" && item.trim()) {
                treatments.push(
                    buildTreatmentFromString(item, {
                        indication: "Lifestyle modification",
                        contraindications: fallbackContraindications,
                        monitoring: fallbackMonitoring,
                    })
                );
            }
        }
    }

    if (Array.isArray(therapeuticOptions.pharmacologic_treatment)) {
        for (const option of therapeuticOptions.pharmacologic_treatment) {
            const firstLineAgents = toStringArray(option?.first_line_agents);
            for (const agent of firstLineAgents) {
                treatments.push(
                    buildTreatmentFromString(agent, {
                        indication:
                            typeof option?.selection_considerations === "string"
                                ? option.selection_considerations
                                : "Pharmacologic treatment",
                        contraindications: fallbackContraindications,
                        monitoring: fallbackMonitoring,
                    })
                );
            }
        }
    }

    return treatments;
}

export function extractPrimaryClinicalConcern({ diagnosis, symptoms = [] } = {}) {
    if (typeof diagnosis === "string" && diagnosis.trim()) {
        return diagnosis.trim();
    }

    const safeSymptoms = Array.isArray(symptoms)
        ? symptoms.filter((entry) => typeof entry === "string")
        : [];

    for (const symptom of safeSymptoms) {
        const match = symptom.match(/(?:^|\|)\s*Main symptom:\s*([^|]+)/i);
        if (match?.[1]?.trim()) {
            return match[1].trim();
        }
    }

    return safeSymptoms.join(" ").trim();
}

export function normalizeClinicalAnalysis(
    raw,
    {
        model = process.env.OPENAI_MODEL ?? "fallback",
        primaryConcern = "",
    } = {}
) {
    const pa = raw?.patient_analysis ?? {};
    const root = { ...raw };
    delete root.patient_analysis;
    const liftedOtherAIFields =
        raw?.other_ai_fields && typeof raw.other_ai_fields === "object"
            ? raw.other_ai_fields
            : {};

    const merged = { ...liftedOtherAIFields, ...root, ...pa };

    const mappedTherapeuticTreatments = flattenTherapeuticOptions(merged.therapeutic_options, merged);

    const explicitTreatments = Array.isArray(merged.treatments)
        ? merged.treatments.map((treatment) => ({
            name: treatment?.name ?? "Traitement non spécifié",
            indication: treatment?.indication ?? "",
            dosage: treatment?.dosage ?? "",
            duration: treatment?.duration ?? "",
            contraindications: Array.isArray(treatment?.contraindications)
                ? treatment.contraindications
                : [],
            monitoring: Array.isArray(treatment?.monitoring)
                ? treatment.monitoring
                : [],
            evidence_level: treatment?.evidence_level ?? "C",
        }))
        : [];

    const treatments = explicitTreatments.length > 0
        ? explicitTreatments
        : mappedTherapeuticTreatments.length > 0
            ? mappedTherapeuticTreatments
            : [];

    const patientSummaryPlain =
        typeof merged.patient_summary === "string"
            ? merged.patient_summary
            : merged.patient_summary?.plain_language;
    const patientSummaryClinical =
        typeof merged.clinical_summary === "string"
            ? merged.clinical_summary
            : merged.patient_summary?.clinical_language;
    const normalizedPrimaryConcern =
        typeof primaryConcern === "string" && primaryConcern.trim()
            ? primaryConcern.trim()
            : "";
    const suspectedDiagnosis =
        merged.diagnosis?.suspected ??
        (normalizedPrimaryConcern || DEFAULT_DIAGNOSIS_SUSPECTED);

    const base = {
        diagnosis: {
            suspected: suspectedDiagnosis,
            certainty_level:
                merged.diagnosis?.certainty_level ?? DEFAULT_DIAGNOSIS_CERTAINTY,
            justification:
                merged.diagnosis?.justification ??
                DEFAULT_DIAGNOSIS_JUSTIFICATION,
        },
        treatments,
        alternatives: Array.isArray(merged.alternatives)
            ? merged.alternatives
            : [],
        red_flags: Array.isArray(merged.red_flags) ? merged.red_flags : [],
        patient_summary: {
            plain_language:
                patientSummaryPlain ??
                DEFAULT_PATIENT_SUMMARY_PLAIN,
            clinical_language:
                patientSummaryClinical ??
                DEFAULT_PATIENT_SUMMARY_CLINICAL,
        },
        meta: {
            model,
            confidence_score:
                typeof merged.confidence_score === "number"
                    ? merged.confidence_score
                    : DEFAULT_CONFIDENCE_SCORE,
        },
    };

    for (const key of KNOWN_AI_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(merged, key)) {
            base[key] = merged[key];
        }
    }

    const otherAIFields = {};
    for (const [key, value] of Object.entries(merged)) {
        if (!STANDARD_KEYS.has(key) && !KNOWN_AI_FIELDS.includes(key) && value !== undefined) {
            otherAIFields[key] = value;
        }
    }

    if (Object.keys(otherAIFields).length > 0) {
        base.other_ai_fields = otherAIFields;
    }

    return base;
}

export function isPlaceholderClinicalAnalysis(analysis) {
    const normalized = normalizeClinicalAnalysis(analysis, {
        model: analysis?.meta?.model ?? process.env.OPENAI_MODEL ?? "fallback",
    });

    const hasAdvancedFields = KNOWN_AI_FIELDS.some((key) =>
        hasMeaningfulValue(normalized[key])
    ) || hasMeaningfulValue(normalized.other_ai_fields);

    return (
        normalized.diagnosis.suspected === DEFAULT_DIAGNOSIS_SUSPECTED &&
        normalized.diagnosis.certainty_level === DEFAULT_DIAGNOSIS_CERTAINTY &&
        normalized.diagnosis.justification === DEFAULT_DIAGNOSIS_JUSTIFICATION &&
        normalized.treatments.length === 0 &&
        normalized.alternatives.length === 0 &&
        normalized.red_flags.length === 0 &&
        normalized.patient_summary.plain_language === DEFAULT_PATIENT_SUMMARY_PLAIN &&
        normalized.patient_summary.clinical_language === DEFAULT_PATIENT_SUMMARY_CLINICAL &&
        !hasAdvancedFields
    );
}