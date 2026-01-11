// backend/mocks/clinicalMocks.js

export const mockHypertension = {
    patient_summary:
        "Votre tension est élevée. Une combinaison de changements de mode de vie et de médicaments peut aider à la réduire.",
    treatments: [
        {
            name: "Modifications du mode de vie",
            justification:
                "Toujours recommandé avant ou en combinaison avec un traitement médicamenteux.",
            contraindications: [],
            efficacy: 55
        },
        {
            name: "Amlodipine",
            justification:
                "Calcium-bloquant efficace chez les patients plus âgés.",
            contraindications: ["Hypotension sévère"],
            efficacy: 82
        },
        {
            name: "Ramipril",
            justification:
                "IEC efficace en première ligne, surtout si atteinte rénale.",
            contraindications: ["Grossesse", "Angio-œdème"],
            efficacy: 88
        }
    ]
};

export const mockDiabetes = {
    patient_summary:
        "Votre glycémie est élevée, ce qui indique un diabète de type 2. Des traitements et des changements de mode de vie peuvent aider à stabiliser votre niveau de sucre.",
    treatments: [
        {
            name: "Metformine",
            justification:
                "Traitement de première intention recommandé, bien toléré.",
            contraindications: ["Insuffisance rénale sévère"],
            efficacy: 90
        },
        {
            name: "Perte de poids",
            justification:
                "Peut améliorer la sensibilité à l'insuline et réduire la glycémie.",
            contraindications: [],
            efficacy: 60
        },
        {
            name: "Inhibiteurs SGLT2",
            justification:
                "Favorisent l'élimination du sucre par les urines.",
            contraindications: ["Antécédents d'infections urinaires sévères"],
            efficacy: 75
        }
    ]
};

export const mockCholesterol = {
    patient_summary:
        "Votre taux de cholestérol est trop élevé. Réduire le LDL aide à diminuer les risques cardiovasculaires.",
    treatments: [
        {
            name: "Statines",
            justification:
                "Traitement de référence pour réduire le LDL et les événements cardiovasculaires.",
            contraindications: ["Maladie hépatique active"],
            efficacy: 85
        },
        {
            name: "Augmentation de l'activité physique",
            justification: "Améliore le profil lipidique global.",
            contraindications: [],
            efficacy: 40
        },
        {
            name: "Ézétimibe",
            justification:
                "Utilisé si les statines sont insuffisantes ou mal tolérées.",
            contraindications: [],
            efficacy: 65
        }
    ]
};

export const mockAsthma = {
    patient_summary:
        "Vous présentez des symptômes d’asthme. Le traitement permet d'améliorer la respiration et de prévenir les crises.",
    treatments: [
        {
            name: "Corticostéroïdes inhalés",
            justification:
                "Traitement de base pour réduire l'inflammation bronchique.",
            contraindications: [],
            efficacy: 90
        },
        {
            name: "Bronchodilatateurs",
            justification:
                "Aident à ouvrir les voies respiratoires en phase aiguë.",
            contraindications: ["Arythmies sévères"],
            efficacy: 80
        }
    ]
};

export const mockMigraine = {
    patient_summary:
        "Vous présentez une migraine. Certains traitements peuvent réduire la douleur et prévenir les crises.",
    treatments: [
        {
            name: "Triptans",
            justification:
                "Traitement efficace en phase aiguë des migraines.",
            contraindications: ["Maladie coronaire"],
            efficacy: 75
        },
        {
            name: "Bêtabloquants",
            justification:
                "Utilisés en prévention des crises.",
            contraindications: ["Asthme sévère"],
            efficacy: 65
        },
        {
            name: "Repos dans un endroit sombre",
            justification:
                "Réduit les stimuli aggravant la crise.",
            contraindications: [],
            efficacy: 30
        }
    ]
};

export const mockHeartFailure = {
    patient_summary:
        "Vous présentez une insuffisance cardiaque. Certains traitements peuvent alléger les symptômes, protéger le cœur et réduire les risques d’hospitalisation.",
    treatments: [
        {
            name: "Inhibiteurs SGLT2 (ex: Dapagliflozine)",
            justification:
                "Ont démontré une réduction des hospitalisations et de la mortalité, même chez les non-diabétiques.",
            contraindications: ["Insuffisance rénale sévère", "Déshydratation"],
            efficacy: 85
        },
        {
            name: "Bêtabloquants",
            justification:
                "Ralentissent le rythme cardiaque et diminuent la charge de travail du cœur.",
            contraindications: ["Asthme sévère", "Bradycardie"],
            efficacy: 75
        },
        {
            name: "Diurétiques de l’anse (ex: Furosémide)",
            justification:
                "Réduisent la congestion, l'œdème et la dyspnée.",
            contraindications: ["Déshydratation", "Insuffisance rénale aiguë"],
            efficacy: 65
        }
    ]
};

export function getMockForDiagnosis(diagnosis = "") {
    const d = diagnosis.toLowerCase();

    if (d.includes("hyperten"))
        return mockHypertension;

    if (d.includes("diab"))
        return mockDiabetes;

    if (d.includes("cholest"))
        return mockCholesterol;

    if (d.includes("asth"))
        return mockAsthma;

    if (d.includes("migra"))
        return mockMigraine;

    if (d.includes("insuffis") || d.includes("cardia") || d.includes("icc"))
        return mockHeartFailure;

    // fallback générique
    return {
        patient_summary:
            "Aucun mock spécifique trouvé, mais voici un exemple générique.",
        treatments: []
    };
}
