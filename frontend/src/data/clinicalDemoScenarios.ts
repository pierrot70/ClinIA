import { anticipatedQuestions, hypertensionTreatments } from "./hypertension";
import type { Treatment } from "./types";
import type { ClinicalPayload } from "../types/clinical";

type DemoQuestion = {
    question: string;
    answer: string;
};

type ClinicalRelevanceLevel = 1 | 2 | 3 | 4 | 5;

type ClinicalRelevanceSeries = {
    name: string;
    values: ClinicalRelevanceLevel[];
};

type ClinicalRelevanceSource = {
    label: string;
    url: string;
};

type ClinicalRelevanceByAgeChart = {
    title: string;
    subtitle: string;
    interpretationNote: string;
    ageBuckets: string[];
    levelLabels: Record<ClinicalRelevanceLevel, string>;
    series: ClinicalRelevanceSeries[];
    sources: ClinicalRelevanceSource[];
};

type ClinicalDemoScenario = {
    treatments: Treatment[];
    questions: DemoQuestion[];
    relevanceByAgeChart?: ClinicalRelevanceByAgeChart;
};

type DiabetesChartProfile =
    | "standard"
    | "cardiorenal_high_risk"
    | "frailty_reported";

const cataractTreatments: Treatment[] = [
    {
        id: "artificial-tears",
        name: "Artificial tears",
        shortName: "Artificial tears",
        class: "Ocular lubricant",
        efficacy: 0.45,
        sideEffectScore: 8,
        summary:
            "May improve visual comfort if dry eye contributes to symptoms, without treating the cataract itself.",
        details:
            "Simulated data: ocular lubricants are useful as a comfort measure in patients with associated glare or irritation. Ophthalmological reassessment remains necessary.",
        flags: ["wellTolerated"],
    },
    {
        id: "vision-optimization",
        name: "Optical optimization",
        shortName: "Vision correction",
        class: "Conservative measure",
        efficacy: 0.58,
        sideEffectScore: 5,
        summary:
            "Updating vision correction and lighting may help temporarily in early cataracts.",
        details:
            "Simulated data: adjusting glasses, contrast and ambient lighting may improve daily activities before surgical management.",
        flags: ["wellTolerated"],
    },
    {
        id: "cataract-surgery",
        name: "Cataract surgery",
        shortName: "Phacoemulsification",
        class: "Surgical treatment",
        efficacy: 0.93,
        sideEffectScore: 28,
        summary:
            "The standard treatment when reduced vision affects the patient's daily functioning.",
        details:
            "Simulated data: surgery is generally considered if visual acuity, independence or driving are affected. A preoperative ophthalmological assessment is required.",
        flags: ["monitoring"],
    },
];

const cataractQuestions: DemoQuestion[] = [
    {
        question: "When should a prompt ophthalmological assessment be arranged?",
        answer:
            "Simulated data: when progressive vision loss limits activities, glare is significant or there is diagnostic uncertainty involving another eye condition.",
    },
    {
        question: "Can eye drops treat a cataract?",
        answer:
            "Simulated data: no, drops can only improve comfort if dry eye is also present. Definitive treatment remains surgical when the cataract becomes disabling.",
    },
    {
        question: "What should be monitored during follow-up?",
        answer:
            "Simulated data: functional impact, progression of vision loss, tolerance of glare and safety during activities such as driving.",
    },
];

const gastricCancerTreatments: Treatment[] = [
    {
        id: "staging-workup",
        name: "Staging workup",
        shortName: "Staging workup",
        class: "Initial assessment",
        efficacy: 0.86,
        sideEffectScore: 10,
        summary:
            "Helps organize management promptly and guide the multidisciplinary treatment strategy.",
        details:
            "Simulated data: imaging and histological assessment help confirm the extent of disease before any treatment decision.",
        flags: ["monitoring"],
    },
    {
        id: "systemic-therapy",
        name: "Systemic cancer therapy",
        shortName: "Chemotherapy",
        class: "Cancer treatment",
        efficacy: 0.72,
        sideEffectScore: 55,
        summary:
            "Often considered based on stage and general condition, in coordination with gastrointestinal oncology.",
        details:
            "Simulated data: protocols depend on tumor stage, biological status and the multidisciplinary plan. Hematological and nutritional monitoring is important.",
        flags: ["monitoring"],
    },
    {
        id: "supportive-care",
        name: "Nutritional and symptom support",
        shortName: "Clinical support",
        class: "Supportive care",
        efficacy: 0.67,
        sideEffectScore: 12,
        summary:
            "Useful for improving general condition, treatment tolerability and quality of life.",
        details:
            "Simulated data: management of pain, anemia, nausea and malnutrition with close follow-up.",
        flags: ["wellTolerated"],
    },
];

const gastricCancerQuestions: DemoQuestion[] = [
    {
        question: "What is the next step after diagnosis?",
        answer:
            "Simulated data: arrange a staging workup and multidisciplinary discussion to confirm the stage and treatment options.",
    },
    {
        question: "Which clinical risks require prompt monitoring?",
        answer:
            "Simulated data: significant weight loss, gastrointestinal bleeding, obstruction, malnutrition and deterioration in general condition.",
    },
    {
        question: "What is the role of supportive care?",
        answer:
            "Simulated data: supportive care is essential from the outset for nutrition, symptom control and tolerability of cancer treatments.",
    },
];

const mononucleosisTreatments: Treatment[] = [
    {
        id: "rest-hydration",
        name: "Rest and hydration",
        shortName: "Rest",
        class: "Supportive measure",
        efficacy: 0.8,
        sideEffectScore: 4,
        summary:
            "The basis of symptomatic management in uncomplicated cases.",
        details:
            "Simulated data: rest, hydration and a gradual return to activities reduce discomfort and support recovery.",
        flags: ["wellTolerated"],
    },
    {
        id: "analgesics-antipyretics",
        name: "Analgesics and antipyretics",
        shortName: "Analgesics",
        class: "Symptomatic treatment",
        efficacy: 0.7,
        sideEffectScore: 14,
        summary:
            "May help control fever, odynophagia and associated pain.",
        details:
            "Simulated data: the choice depends on the patient's profile and the usual contraindications. Clinical comfort remains the goal.",
        flags: ["wellTolerated"],
    },
    {
        id: "activity-restriction",
        name: "Restriction of high-risk sports",
        shortName: "Avoid impacts",
        class: "Prevention of complications",
        efficacy: 0.76,
        sideEffectScore: 3,
        summary:
            "Important for reducing the risk of splenic complications during the acute phase.",
        details:
            "Simulated data: avoid contact activities or intense exertion during the period considered at risk based on clinical assessment.",
        flags: ["monitoring"],
    },
];

const mononucleosisQuestions: DemoQuestion[] = [
    {
        question: "Why should sports activities be limited?",
        answer:
            "Simulated data: to reduce the risk of splenic complications during the acute phase, especially if fatigue is significant or splenomegaly is suspected.",
    },
    {
        question: "When is more urgent reassessment needed?",
        answer:
            "Simulated data: with dyspnea, left-sided abdominal pain, marked worsening of odynophagia or inability to maintain adequate hydration.",
    },
    {
        question: "Are antibiotics useful?",
        answer:
            "Simulated data: not in uncomplicated viral mononucleosis, unless another bacterial infection is documented.",
    },
];

const depressionTreatments: Treatment[] = [
    {
        id: "psychotherapy",
        name: "Structured psychotherapy",
        shortName: "Psychotherapy",
        class: "Nonpharmacological approach",
        efficacy: 0.78,
        sideEffectScore: 6,
        summary:
            "A common first-line option, alone or combined with other treatment depending on severity and clinical context.",
        details:
            "Simulated data: structured approaches such as CBT may improve symptoms, functioning and coping strategies.",
        flags: ["wellTolerated"],
    },
    {
        id: "ssri",
        name: "SSRIs",
        shortName: "SSRIs",
        class: "Antidepressant",
        efficacy: 0.74,
        sideEffectScore: 32,
        summary:
            "Often considered based on severity, history and patient preferences.",
        details:
            "Simulated data: close follow-up is useful initially to assess tolerability, adherence and suicide risk.",
        flags: ["monitoring"],
    },
    {
        id: "sleep-behavioral-support",
        name: "Sleep measures and behavioral activation",
        shortName: "Activation",
        class: "Clinical support",
        efficacy: 0.63,
        sideEffectScore: 5,
        summary:
            "May help gradually restore routines and daily functioning.",
        details:
            "Simulated data: structuring activity, sleep and functional goals is often useful in overall management.",
        flags: ["wellTolerated"],
    },
];

const depressionQuestions: DemoQuestion[] = [
    {
        question: "What should be reassessed first?",
        answer:
            "Simulated data: patient safety, including suicidal ideation, functional capacity and the intensity of depressive symptoms.",
    },
    {
        question: "When should psychotherapy and pharmacological treatment be combined?",
        answer:
            "Simulated data: the combination may be appropriate when symptoms are moderate to severe, persistent or associated with significant functional impairment.",
    },
    {
        question: "What initial follow-up is useful?",
        answer:
            "Simulated data: close initial follow-up helps assess progress, adherence, tolerability and clinical risk factors.",
    },
];

const diabetesTreatments: Treatment[] = [
    {
        id: "metformin",
        name: "Metformin",
        shortName: "Metformin",
        class: "Biguanide",
        efficacy: 0.9,
        sideEffectScore: 20,
        summary:
            "A first-line treatment frequently used in type 2 diabetes, especially in the presence of excess weight or insulin resistance.",
        details:
            "Simulated data: metformin helps lower blood glucose and has a well-established history of use. Caution is required if renal function is impaired.",
        flags: ["wellTolerated", "monitoring"],
    },
    {
        id: "continue-current-strategy",
        name: "Cautious continuation of the current strategy",
        shortName: "Current strategy",
        class: "Clinical reassessment",
        efficacy: 0.68,
        sideEffectScore: 6,
        summary:
            "May be reasonable if glycemic control is adequate, tolerability is good and clinical goals are met.",
        details:
            "Simulated data: before intensifying treatment, it is useful to review HbA1c, weight, metformin tolerability, comorbidities and overall cardiometabolic risk.",
        flags: ["wellTolerated", "monitoring"],
    },
    {
        id: "sglt2-inhibitor",
        name: "SGLT2 inhibitor",
        shortName: "SGLT2",
        class: "Oral antidiabetic agent",
        efficacy: 0.76,
        sideEffectScore: 28,
        summary:
            "A useful option depending on the cardiorenal and metabolic profile, particularly with cardiovascular risk or heart failure.",
        details:
            "Simulated data: this class promotes urinary glucose excretion and may provide cardiorenal benefits depending on the clinical context.",
        flags: ["monitoring"],
    },
    {
        id: "glp1-review",
        name: "Reassessment of a GLP-1 option",
        shortName: "GLP-1 option",
        class: "Treatment reassessment",
        efficacy: 0.74,
        sideEffectScore: 26,
        summary:
            "May be discussed based on weight, glycemic control, cardiovascular risk and tolerability of current treatment.",
        details:
            "Simulated data: a GLP-1 option may be appropriate in some cardiometabolic profiles, without automatically replacing metformin or the physician's clinical judgment.",
        flags: ["monitoring"],
    },
    {
        id: "lifestyle-diabetes",
        name: "Lifestyle measures",
        shortName: "Lifestyle",
        class: "Nonpharmacological measure",
        efficacy: 0.62,
        sideEffectScore: 4,
        summary:
            "Diet, physical activity and weight loss may significantly improve glycemic control.",
        details:
            "Simulated data: an adapted nutritional approach, regular physical activity and self-management support are part of initial management.",
        flags: ["wellTolerated"],
    },
];

const diabetesQuestions: DemoQuestion[] = [
    {
        question: "When might continuing the current strategy be reasonable?",
        answer:
            "Simulated data: if glycemic control is adequate, tolerability is good and clinical goals are met, continuing the current strategy with monitoring may be reasonable.",
    },
    {
        question: "When might reassessment of a GLP-1 option be discussed?",
        answer:
            "Simulated data: based on weight, cardiometabolic profile, cardiovascular risk, tolerability of current treatment and glycemic control goals.",
    },
    {
        question: "What follow-up information is useful when reassessing treatment?",
        answer:
            "Simulated data: changes in blood glucose, gastrointestinal tolerability, weight, renal function and cardiovascular risk factors warrant reassessment.",
    },
];

const diabetesRelevanceByAgeChartBase: ClinicalRelevanceByAgeChart = {
    title: "Relative clinical role by age and context",
    subtitle:
        "An original ClinIA synthesis informed by recognized guidelines. Does not represent a quantitative measure of efficacy.",
    interpretationNote:
        "This visual does not indicate a direct decline in pharmacological efficacy with age. It illustrates how an option's relative clinical role may change with age, frailty, renal function, tolerability and cardiorenal risk.",
    ageBuckets: ["<40", "40-49", "50-59", "60-69", "70+"],
    levelLabels: {
        1: "Low relevance",
        2: "Consider",
        3: "Moderate relevance",
        4: "Often relevant",
        5: "High contextual relevance",
    },
    series: [
        {
            name: "Metformin",
            values: [5, 5, 5, 4, 4],
        },
        {
            name: "Cautious continuation of the current strategy",
            values: [2, 2, 3, 4, 4],
        },
        {
            name: "SGLT2 inhibitor",
            values: [2, 3, 4, 4, 4],
        },
        {
            name: "GLP-1 option",
            values: [2, 3, 4, 4, 4],
        },
        {
            name: "Lifestyle",
            values: [5, 5, 5, 4, 4],
        },
    ],
    sources: [
        {
            label: "ADA Standards of Care 2025 - Older Adults",
            url: "https://diabetesjournals.org/care/article/48/Supplement_1/S266/157556/13-Older-Adults-Standards-of-Care-in-Diabetes-2025",
        },
        {
            label: "Diabetes Canada 2024 - Pharmacologic Glycemic Management",
            url: "https://guidelines.diabetes.ca/cpg/chapter-13-2024-update",
        },
        {
            label: "Diabetes Canada - Older People",
            url: "https://www.diabetes.ca/health-care-providers/clinical-practice-guidelines/chapter-37",
        },
        {
            label: "NICE NG28 - Type 2 diabetes in adults",
            url: "https://www.nice.org.uk/guidance/ng28",
        },
    ],
};

function cloneChart(
    chart: ClinicalRelevanceByAgeChart
): ClinicalRelevanceByAgeChart {
    return {
        ...chart,
        ageBuckets: [...chart.ageBuckets],
        levelLabels: { ...chart.levelLabels },
        series: chart.series.map((series) => ({
            ...series,
            values: [...series.values],
        })),
        sources: chart.sources.map((source) => ({ ...source })),
    };
}

function buildDiabetesRelevanceByAgeChart(
    payload?: Partial<ClinicalPayload> | null
): ClinicalRelevanceByAgeChart {
    const chart = cloneChart(diabetesRelevanceByAgeChartBase);
    const profile = getDiabetesChartProfile(payload);

    if (profile === "cardiorenal_high_risk") {
        chart.subtitle =
            "An original ClinIA synthesis for a high-risk cardiorenal profile. Does not represent a quantitative measure of efficacy.";
        chart.interpretationNote =
            "In this profile, cardiovascular and renal risks carry greater clinical weight. This visual does not represent a direct decline in efficacy with age and should be interpreted alongside frailty, tolerability and glycemic goals.";
        chart.series = chart.series.map((series) => {
            if (series.name === "SGLT2 inhibitor") {
                return { ...series, values: [3, 4, 5, 5, 5] };
            }
            if (series.name === "GLP-1 option") {
                return { ...series, values: [3, 4, 5, 5, 4] };
            }
            if (series.name === "Cautious continuation of the current strategy") {
                return { ...series, values: [1, 2, 2, 3, 3] };
            }
            return series;
        });
    }

    if (profile === "frailty_reported") {
        chart.subtitle =
            "An original ClinIA synthesis for a profile with explicitly reported frailty. Does not represent a quantitative measure of efficacy.";
        chart.interpretationNote =
            "In this profile, frailty, tolerability and overall safety matter more. This visual helps contextualize treatment caution, without by itself suggesting a decline in pharmacological efficacy or replacing clinical judgment. Reported frailty does not remove the need to assess cardiovascular and renal risks separately.";
        chart.series = chart.series.map((series) => {
            if (series.name === "Metformin") {
                return { ...series, values: [5, 5, 4, 3, 2] };
            }
            if (series.name === "Cautious continuation of the current strategy") {
                return { ...series, values: [2, 2, 3, 4, 5] };
            }
            if (series.name === "SGLT2 inhibitor") {
                return { ...series, values: [2, 3, 3, 3, 2] };
            }
            if (series.name === "GLP-1 option") {
                return { ...series, values: [2, 3, 4, 3, 2] };
            }
            if (series.name === "Lifestyle") {
                return { ...series, values: [5, 5, 5, 4, 3] };
            }
            return series;
        });
    }

    chart.interpretationNote +=
        " Age or limited medication tolerability alone does not establish frailty. Missing frailty information does not establish low frailty.";
    return chart;
}

const scenarios: Record<string, ClinicalDemoScenario> = {
    hypertension: {
        treatments: hypertensionTreatments,
        questions: anticipatedQuestions,
    },
    cataract: {
        treatments: cataractTreatments,
        questions: cataractQuestions,
    },
    gastricCancer: {
        treatments: gastricCancerTreatments,
        questions: gastricCancerQuestions,
    },
    mononucleosis: {
        treatments: mononucleosisTreatments,
        questions: mononucleosisQuestions,
    },
    majorDepression: {
        treatments: depressionTreatments,
        questions: depressionQuestions,
    },
    diabetesType2: {
        treatments: diabetesTreatments,
        questions: diabetesQuestions,
    },
};

function normalizeOptional(value: unknown) {
    return normalize(typeof value === "string" ? value : "");
}

function getDiabetesChartProfile(
    payload?: Partial<ClinicalPayload> | null
): DiabetesChartProfile {
    const diabetesContext = payload?.diabetes_context;
    const fragility = normalizeOptional(diabetesContext?.fragility);
    const renalFunction = normalizeOptional(diabetesContext?.renal_function);
    const cardiovascularRisk = normalizeOptional(
        diabetesContext?.cardiovascular_risk
    );
    // Frailty must be explicitly reported. Age, tolerability and missing data
    // cannot establish it; exact values also avoid matching negated phrases.
    const hasReportedFrailty = new Set([
        "elevee", "fragilite elevee", "tres elevee", "high",
        "high frailty", "very high", "frail", "fragile",
    ]).has(fragility);

    if (hasReportedFrailty) {
        return "frailty_reported";
    }

    const isCardiorenalHighRiskProfile =
        cardiovascularRisk.includes("tres eleve") ||
        cardiovascularRisk.includes("very high") ||
        cardiovascularRisk.includes("tres haute") ||
        ((cardiovascularRisk.includes("eleve") || cardiovascularRisk.includes("high")) &&
            (renalFunction.includes("moderee") ||
                renalFunction.includes("moderate") ||
                renalFunction.includes("importante") ||
        renalFunction.includes("severe") ||
                renalFunction.includes("chronique") ||
                renalFunction.includes("chronic"))) ||
        renalFunction.includes("importante") ||
        renalFunction.includes("severe") ||
        renalFunction.includes("chronique") ||
        renalFunction.includes("chronic");

    if (isCardiorenalHighRiskProfile) {
        return "cardiorenal_high_risk";
    }

    return "standard";
}

function normalize(value: string) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function matchScenarioKey(payload?: Partial<ClinicalPayload> | null) {
    const haystack = [
        payload?.diagnosis,
        ...(payload?.symptoms ?? []),
        ...(payload?.medical_history ?? []),
    ]
        .filter(Boolean)
        .map((value) => normalize(String(value)))
        .join(" ");

    if (!haystack) {
        return "hypertension";
    }

    if (haystack.includes("cataract")) {
        return "cataract";
    }

    if (
        haystack.includes("cancer de l'estomac") ||
        haystack.includes("cancer gastrique") ||
        haystack.includes("gastric cancer")
    ) {
        return "gastricCancer";
    }

    if (
        haystack.includes("mononucleose") ||
        haystack.includes("mononucleosis")
    ) {
        return "mononucleosis";
    }

    if (
        haystack.includes("trouble depressif majeur") ||
        haystack.includes("depression majeure") ||
        haystack.includes("major depression") ||
        haystack.includes("major depressive disorder")
    ) {
        return "majorDepression";
    }

    if (
        haystack.includes("diabete de type 2") ||
        haystack.includes("diabete type 2") ||
        haystack.includes("type 2") ||
        haystack.includes("diabete") ||
        haystack.includes("diabetes")
    ) {
        return "diabetesType2";
    }

    if (haystack.includes("hypertension")) {
        return "hypertension";
    }

    return "hypertension";
}

export function getClinicalDemoScenario(
    payload?: Partial<ClinicalPayload> | null
): ClinicalDemoScenario {
    const scenarioKey = matchScenarioKey(payload);
    const scenario = scenarios[scenarioKey];

    if (scenarioKey !== "diabetesType2") {
        return scenario;
    }

    return {
        ...scenario,
        relevanceByAgeChart: buildDiabetesRelevanceByAgeChart(payload),
    };
}
