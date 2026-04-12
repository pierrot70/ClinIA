import { anticipatedQuestions, hypertensionTreatments } from "./hypertension";
import type { Treatment } from "./types";
import type { ClinicalPayload } from "../types/clinical";

type DemoQuestion = {
    question: string;
    answer: string;
};

type ClinicalDemoScenario = {
    treatments: Treatment[];
    questions: DemoQuestion[];
};

const cataractTreatments: Treatment[] = [
    {
        id: "artificial-tears",
        name: "Larmes artificielles",
        shortName: "Larmes artificielles",
        class: "Lubrifiant oculaire",
        efficacy: 0.45,
        sideEffectScore: 8,
        summary:
            "Peuvent ameliorer le confort visuel si une secheresse oculaire contribue aux symptomes, sans traiter la cataracte elle-meme.",
        details:
            "Donnees simulees : les lubrifiants oculaires sont utiles comme mesure de confort chez les patients presentant eblouissements ou irritation associes. Une reevaluation ophtalmologique reste necessaire.",
        flags: ["wellTolerated"],
    },
    {
        id: "vision-optimization",
        name: "Optimisation optique",
        shortName: "Correction visuelle",
        class: "Mesure conservative",
        efficacy: 0.58,
        sideEffectScore: 5,
        summary:
            "Une mise a jour de la correction visuelle et de l'eclairage peut aider temporairement dans les cataractes debutantes.",
        details:
            "Donnees simulees : ajuster lunettes, contraste et eclairage ambiant peut ameliorer les activites quotidiennes avant une prise en charge chirurgicale.",
        flags: ["wellTolerated"],
    },
    {
        id: "cataract-surgery",
        name: "Chirurgie de la cataracte",
        shortName: "Phacoemulsification",
        class: "Traitement chirurgical",
        efficacy: 0.93,
        sideEffectScore: 28,
        summary:
            "Traitement de reference lorsque la baisse de vision affecte le fonctionnement quotidien du patient.",
        details:
            "Donnees simulees : la chirurgie est generalement envisagee si l'acuite visuelle, l'autonomie ou la conduite sont impactees. Une evaluation ophtalmologique preoperatoire est requise.",
        flags: ["monitoring"],
    },
];

const cataractQuestions: DemoQuestion[] = [
    {
        question: "Quand orienter vers une evaluation ophtalmologique rapide ?",
        answer:
            "Donnees simulees : en cas de baisse de vision progressive limitant les activites, d'eblouissements importants ou de doute diagnostique avec une autre pathologie oculaire.",
    },
    {
        question: "Les gouttes peuvent-elles traiter une cataracte ?",
        answer:
            "Donnees simulees : non, les gouttes peuvent seulement ameliorer le confort si une secheresse oculaire est associee. Le traitement definitif reste chirurgical lorsque la cataracte devient invalidante.",
    },
    {
        question: "Quels elements de suivi surveiller ?",
        answer:
            "Donnees simulees : impact fonctionnel, progression de la baisse de vision, tolerance a l'eblouissement et securite dans les activites comme la conduite.",
    },
];

const gastricCancerTreatments: Treatment[] = [
    {
        id: "staging-workup",
        name: "Bilan d'extension",
        shortName: "Bilan d'extension",
        class: "Evaluation initiale",
        efficacy: 0.86,
        sideEffectScore: 10,
        summary:
            "Permet de structurer rapidement la prise en charge et de guider la strategie therapeutique multidisciplinaire.",
        details:
            "Donnees simulees : l'imagerie et l'evaluation histologique permettent de confirmer l'etendue de la maladie avant toute decision therapeutique.",
        flags: ["monitoring"],
    },
    {
        id: "systemic-therapy",
        name: "Traitement systemique oncologique",
        shortName: "Chimiotherapie",
        class: "Traitement oncologique",
        efficacy: 0.72,
        sideEffectScore: 55,
        summary:
            "Souvent envisage selon le stade et l'etat general, en coordination avec l'oncologie digestive.",
        details:
            "Donnees simulees : les protocoles dependent du stade tumoral, du statut biologique et du plan multidisciplinaire. Une surveillance hematologique et nutritionnelle est importante.",
        flags: ["monitoring"],
    },
    {
        id: "supportive-care",
        name: "Soutien nutritionnel et symptomatique",
        shortName: "Support clinique",
        class: "Soins de support",
        efficacy: 0.67,
        sideEffectScore: 12,
        summary:
            "Utile pour ameliorer l'etat general, la tolerance aux traitements et la qualite de vie.",
        details:
            "Donnees simulees : prise en charge de la douleur, de l'anemie, des nausees et de la denutrition avec un suivi rapproché.",
        flags: ["wellTolerated"],
    },
];

const gastricCancerQuestions: DemoQuestion[] = [
    {
        question: "Quelle est la prochaine etape apres le diagnostic ?",
        answer:
            "Donnees simulees : organiser un bilan d'extension et une discussion multidisciplinaire afin de confirmer le stade et les options therapeutiques.",
    },
    {
        question: "Quels risques cliniques doivent etre surveilles rapidement ?",
        answer:
            "Donnees simulees : perte de poids importante, saignement digestif, obstruction, denutrition et deterioration de l'etat general.",
    },
    {
        question: "Quel est le role des soins de support ?",
        answer:
            "Donnees simulees : ils sont essentiels des le depart pour la nutrition, le controle des symptomes et la tolerance aux traitements oncologiques.",
    },
];

const mononucleosisTreatments: Treatment[] = [
    {
        id: "rest-hydration",
        name: "Repos et hydratation",
        shortName: "Repos",
        class: "Mesure supportive",
        efficacy: 0.8,
        sideEffectScore: 4,
        summary:
            "Base de la prise en charge symptomatique dans les formes non compliquees.",
        details:
            "Donnees simulees : le repos, l'hydratation et une reprise progressive des activites reduisent l'inconfort et favorisent la recuperation.",
        flags: ["wellTolerated"],
    },
    {
        id: "analgesics-antipyretics",
        name: "Antalgiques et antipyretiques",
        shortName: "Antalgiques",
        class: "Traitement symptomatique",
        efficacy: 0.7,
        sideEffectScore: 14,
        summary:
            "Peuvent aider a controler fievre, odynophagie et douleurs associees.",
        details:
            "Donnees simulees : le choix depend du profil du patient et des contre-indications habituelles. L'objectif reste le confort clinique.",
        flags: ["wellTolerated"],
    },
    {
        id: "activity-restriction",
        name: "Restriction des sports a risque",
        shortName: "Eviter les chocs",
        class: "Prevention des complications",
        efficacy: 0.76,
        sideEffectScore: 3,
        summary:
            "Importante pour reduire le risque de complication splenique dans la phase aigue.",
        details:
            "Donnees simulees : eviter les activites de contact ou les efforts intenses pendant la periode jugee a risque selon l'evaluation clinique.",
        flags: ["monitoring"],
    },
];

const mononucleosisQuestions: DemoQuestion[] = [
    {
        question: "Pourquoi limiter les activites sportives ?",
        answer:
            "Donnees simulees : pour reduire le risque de complication splenique durant la phase aigue, surtout si la fatigue est importante ou si une splenomegalie est suspectee.",
    },
    {
        question: "Quand faut-il reevaluer plus rapidement ?",
        answer:
            "Donnees simulees : en cas de dyspnee, douleur abdominale gauche, aggravation marquee de l'odynophagie ou incapacite a s'hydrater adequatement.",
    },
    {
        question: "Les antibiotiques sont-ils utiles ?",
        answer:
            "Donnees simulees : pas dans la mononucleose virale non compliquee, sauf si une autre infection bacterienne est documentee.",
    },
];

const depressionTreatments: Treatment[] = [
    {
        id: "psychotherapy",
        name: "Psychotherapie structuree",
        shortName: "Psychotherapie",
        class: "Approche non pharmacologique",
        efficacy: 0.78,
        sideEffectScore: 6,
        summary:
            "Option frequente de premiere intention, seule ou combinee selon la severite et le contexte clinique.",
        details:
            "Donnees simulees : les approches structurees comme la TCC peuvent ameliorer les symptomes, le fonctionnement et les strategies d'adaptation.",
        flags: ["wellTolerated"],
    },
    {
        id: "ssri",
        name: "ISRS",
        shortName: "ISRS",
        class: "Antidepresseur",
        efficacy: 0.74,
        sideEffectScore: 32,
        summary:
            "Souvent envisages selon la severite, les antecedents et les preferences du patient.",
        details:
            "Donnees simulees : un suivi rapproché est utile au debut pour la tolerance, l'adherence et la reevaluation du risque suicidaire.",
        flags: ["monitoring"],
    },
    {
        id: "sleep-behavioral-support",
        name: "Mesures de sommeil et activation comportementale",
        shortName: "Activation",
        class: "Support clinique",
        efficacy: 0.63,
        sideEffectScore: 5,
        summary:
            "Peuvent aider a restaurer progressivement les routines et le fonctionnement quotidien.",
        details:
            "Donnees simulees : structurer l'activite, le sommeil et les objectifs fonctionnels est souvent utile dans la prise en charge globale.",
        flags: ["wellTolerated"],
    },
];

const depressionQuestions: DemoQuestion[] = [
    {
        question: "Quel element doit etre reevaluer en priorite ?",
        answer:
            "Donnees simulees : la securite du patient, incluant la presence d'idees suicidaires, la capacite fonctionnelle et l'intensite des symptomes depressifs.",
    },
    {
        question: "Quand associer psychotherapie et traitement pharmacologique ?",
        answer:
            "Donnees simulees : l'association peut etre pertinente lorsque les symptomes sont moderes a severes, persistants ou associes a un retentissement fonctionnel important.",
    },
    {
        question: "Quel suivi initial est utile ?",
        answer:
            "Donnees simulees : un suivi rapproche au debut aide a verifier l'evolution, l'adherence, la tolerance et les facteurs de risque cliniques.",
    },
];

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
};

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
        haystack.includes("major depression")
    ) {
        return "majorDepression";
    }

    if (haystack.includes("hypertension")) {
        return "hypertension";
    }

    return "hypertension";
}

export function getClinicalDemoScenario(
    payload?: Partial<ClinicalPayload> | null
): ClinicalDemoScenario {
    return scenarios[matchScenarioKey(payload)];
}

