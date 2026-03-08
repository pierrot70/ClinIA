export type HomeStrings = {
  home: {
    title: string;
    subtitle: string;
    disclaimer: string;
    cardReadTitle: string;
    cardReadBody: string;
    cardChartsTitle: string;
    cardChartsBody: string;
    cardQuestionsTitle: string;
    cardQuestionsBody: string;
  };
  search: {
    secureModeHint: string;
    objectiveLabel: string;
    showAdvanced: string;
    hideAdvanced: string;
    scopeLabel: string;
    ageGroupLabel: string;
    symptomLabel: string;
    durationLabel: string;
    severityLabel: string;
    redFlagsLabel: string;
    comorbidityLabel: string;
    notesLabel: string;
    notesPlaceholder: string;
    launchSecure: string;
    checkAttestation: string;
    attestationRequiredHint: string;
    attestationText: string;
    privacyFooter: string;
    privacyConfirmRequired: string;
    sensitiveDetected: string;
    voiceSensitiveDetected: string;
    blockedSensitive: string;
  };
  options: {
    objectives: string[];
    clinicalScopes: string[];
    ageGroups: string[];
    symptomProfiles: string[];
    durations: string[];
    severityLevels: string[];
    redFlagStatuses: string[];
    comorbidityContexts: string[];
  };
};

export const HOME_STRINGS_FR: HomeStrings = {
  home: {
    title: "Gagnez du temps après chaque diagnostic.",
    subtitle:
      "ClinIA propose, à partir d'un diagnostic, des options de traitement classées selon leur efficacité, leur tolérance et les données actuelles — le tout présenté en quelques secondes, sous forme de synthèse claire, avec saisie clinique anonymisée.",
    disclaimer:
      "Prototype avec données simulées – non destiné à la pratique clinique réelle.",
    cardReadTitle: "6 secondes de lecture",
    cardReadBody:
      "Un résumé ultra-concis : 1 traitement recommandé, 2 alternatives, 3 phrases pour comprendre l'essentiel.",
    cardChartsTitle: "Graphiques explicites",
    cardChartsBody:
      "Efficacité comparative, profil d'effets secondaires et pertinence clinique visualisés en un coup d'oeil.",
    cardQuestionsTitle: "Questions anticipées",
    cardQuestionsBody:
      "L'interface suggère des questions fréquentes et affiche des réponses structurées, pour réduire la charge cognitive.",
  },
  search: {
    secureModeHint:
      "Mode rapide : saisie clinique anonymisée uniquement. Les paramètres avancés restent optionnels.",
    objectiveLabel: "Objectif",
    showAdvanced: "Afficher paramètres avancés",
    hideAdvanced: "Masquer paramètres avancés",
    scopeLabel: "Spécialité",
    ageGroupLabel: "Groupe patient",
    symptomLabel: "Symptôme principal",
    durationLabel: "Durée des symptômes",
    severityLabel: "Sévérité",
    redFlagsLabel: "Drapeaux rouges",
    comorbidityLabel: "Contexte comorbidités",
    notesLabel: "Notes cliniques",
    notesPlaceholder:
      "Notes cliniques anonymisées (aucun identifiant patient)",
    launchSecure: "Lancer Requête sécurisée",
    checkAttestation: "Cochez l'attestation",
    attestationRequiredHint:
      "Étape obligatoire avant envoi: cochez l'attestation ci-dessous pour activer le bouton.",
    attestationText:
      "J'atteste que cette saisie est anonymisée et ne contient aucun identifiant patient (nom, RAMQ, date de naissance, téléphone, courriel, adresse).",
    privacyFooter:
      "ClinIA n'exige aucune donnée nominative : n'entrez jamais de nom, RAMQ, téléphone, courriel, date de naissance ou adresse.",
    privacyConfirmRequired:
      "Veuillez confirmer l'attestation de confidentialité avant l'envoi.",
    sensitiveDetected: "Attention: contenu sensible possible détecté",
    voiceSensitiveDetected:
      "Attention: dictée possiblement sensible détectée",
    blockedSensitive:
      "Entrée bloquée: retirez toute donnée personnelle (nom, RAMQ, téléphone, courriel) avant de continuer.",
  },
  options: {
    objectives: [
      "Traitement initial",
      "Ajustement thérapeutique",
      "Alternative si intolérance",
      "Surveillance et suivi",
    ],
    clinicalScopes: [
      "Médecine générale",
      "Cardiologie",
      "Neurologie",
      "Psychiatrie",
      "Gériatrie",
    ],
    ageGroups: ["Adulte", "Pédiatrique", "Gériatrique", "Grossesse"],
    symptomProfiles: [
      "Hypertension",
      "Douleur chronique",
      "Migraine",
      "Anxiété",
      "Insomnie",
      "Infection respiratoire",
    ],
    durations: ["< 24h", "1-7 jours", "1-4 semaines", "> 1 mois"],
    severityLevels: ["Légère", "Modérée", "Sévère"],
    redFlagStatuses: [
      "Aucun signal d'alarme",
      "Signal(s) d'alarme présent(s)",
    ],
    comorbidityContexts: [
      "Aucune comorbidité majeure",
      "Insuffisance rénale",
      "Insuffisance hépatique",
      "Risque cardiovasculaire élevé",
      "Polypharmacie",
    ],
  },
};

export const HOME_STRINGS_EN: HomeStrings = {
  home: {
    title: "Save time after every diagnosis.",
    subtitle:
      "ClinIA suggests, from a diagnosis, treatment options ranked by effectiveness, tolerance, and current evidence - all presented in seconds as a clear summary with anonymized clinical input.",
    disclaimer:
      "Prototype with simulated data - not intended for real clinical practice.",
    cardReadTitle: "6-second read",
    cardReadBody:
      "An ultra-concise summary: 1 recommended treatment, 2 alternatives, 3 lines for the key takeaways.",
    cardChartsTitle: "Clear charts",
    cardChartsBody:
      "Comparative efficacy, side-effect profile, and clinical relevance visualized at a glance.",
    cardQuestionsTitle: "Anticipated questions",
    cardQuestionsBody:
      "The interface suggests frequent questions and displays structured answers to reduce cognitive load.",
  },
  search: {
    secureModeHint:
      "Quick mode: anonymized clinical input only. Advanced settings remain optional.",
    objectiveLabel: "Objective",
    showAdvanced: "Show advanced settings",
    hideAdvanced: "Hide advanced settings",
    scopeLabel: "Specialty",
    ageGroupLabel: "Patient group",
    symptomLabel: "Main symptom",
    durationLabel: "Symptom duration",
    severityLabel: "Severity",
    redFlagsLabel: "Red flags",
    comorbidityLabel: "Comorbidity context",
    notesLabel: "Clinical notes",
    notesPlaceholder: "Anonymized clinical notes (no patient identifier)",
    launchSecure: "Run Secure Query",
    checkAttestation: "Check the attestation",
    attestationRequiredHint:
      "Required before submit: check the attestation below to enable the button.",
    attestationText:
      "I certify that this input is anonymized and contains no patient identifier (name, RAMQ, date of birth, phone number, email, address).",
    privacyFooter:
      "ClinIA does not require any identifying data: never enter a name, RAMQ, phone number, email, date of birth, or address.",
    privacyConfirmRequired:
      "Please confirm the privacy attestation before sending.",
    sensitiveDetected: "Warning: possible sensitive content detected",
    voiceSensitiveDetected:
      "Warning: possibly sensitive dictated content detected",
    blockedSensitive:
      "Input blocked: remove all personal data (name, RAMQ, phone, email) before continuing.",
  },
  options: {
    objectives: [
      "Initial treatment",
      "Therapeutic adjustment",
      "Alternative for intolerance",
      "Monitoring and follow-up",
    ],
    clinicalScopes: [
      "General medicine",
      "Cardiology",
      "Neurology",
      "Psychiatry",
      "Geriatrics",
    ],
    ageGroups: ["Adult", "Pediatric", "Geriatric", "Pregnancy"],
    symptomProfiles: [
      "Hypertension",
      "Chronic pain",
      "Migraine",
      "Anxiety",
      "Insomnia",
      "Respiratory infection",
    ],
    durations: ["< 24h", "1-7 days", "1-4 weeks", "> 1 month"],
    severityLevels: ["Mild", "Moderate", "Severe"],
    redFlagStatuses: ["No warning sign", "Warning sign(s) present"],
    comorbidityContexts: [
      "No major comorbidity",
      "Renal impairment",
      "Hepatic impairment",
      "High cardiovascular risk",
      "Polypharmacy",
    ],
  },
};
