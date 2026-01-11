import type { Treatment } from "./types";

export const hypertensionTreatments: Treatment[] = [
  {
    id: "indapamide",
    name: "Indapamide",
    shortName: "Indapamide",
    class: "Diurétique thiazidique-like",
    efficacy: 0.94,
    sideEffectScore: 25,
    summary:
      "Agent de première ligne avec un très bon contrôle tensionnel et un profil d'effets secondaires généralement favorable.",
    details:
      "Données simulées : dans les essais randomisés, l'indapamide montre une réduction significative de la pression artérielle, avec un impact positif sur les événements cardiovasculaires à long terme. Une surveillance électrolytique périodique est recommandée.",
    flags: ["wellTolerated"]
  },
  {
    id: "amlodipine",
    name: "Amlodipine",
    shortName: "Amlodipine",
    class: "Inhibiteur calcique",
    efficacy: 0.89,
    sideEffectScore: 35,
    summary:
      "Bien tolérée, particulièrement utile chez les patients avec angor stable ou maladie coronarienne.",
    details:
      "Données simulées : l'amlodipine contrôle efficacement la tension artérielle. Elle peut entraîner des oedèmes périphériques légers. Utile chez les patients plus âgés ou avec comorbidités cardiaques.",
    flags: ["wellTolerated"]
  },
  {
    id: "candesartan",
    name: "Candesartan",
    shortName: "Candesartan",
    class: "Antagoniste des récepteurs de l'angiotensine II (ARA)",
    efficacy: 0.85,
    sideEffectScore: 30,
    summary:
      "Option privilégiée en cas de diabète ou de néphropathie, avec un bon profil de protection rénale (données simulées).",
    details:
      "Données simulées : le candesartan réduit la pression artérielle et offre un effet néphroprotecteur dans certains profils de patients. Une surveillance de la fonction rénale et du potassium est recommandée.",
    flags: ["monitoring"]
  }
];

export const anticipatedQuestions = [
  {
    question: "Que faire si la tension reste élevée après 4 semaines de traitement ?",
    answer:
      "Données simulées : on recommande d'abord de vérifier l'adhésion, l'apport en sel, et la mesure à domicile. Ensuite, augmenter la dose ou ajouter un deuxième agent d'une autre classe peut être envisagé."
  },
  {
    question: "Quel traitement privilégier en cas de diabète de type 2 ?",
    answer:
      "Données simulées : un ARA comme le candesartan est souvent privilégié pour sa protection rénale, mais cela dépend du profil global du patient et des lignes directrices locales."
  },
  {
    question: "Quelles sont les principales contre-indications à surveiller ?",
    answer:
      "Données simulées : insuffisance rénale avancée, hyperkaliémie, hypotension symptomatique et interactions médicamenteuses spécifiques selon l'agent choisi."
  }
];
