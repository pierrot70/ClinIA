const ENGLISH_CLINICAL_CONTENT: Record<string, string> = {
  "Metformine": "Metformin",
  "Poursuite prudente de la strategie actuelle": "Careful continuation of the current strategy",
  "Inhibiteur SGLT2": "SGLT2 inhibitor",
  "Option GLP-1": "GLP-1 option",
  "Mesures de mode de vie": "Lifestyle measures",
  "Mode de vie": "Lifestyle measures",
  "Biguanide": "Biguanide",
  "Reevaluation clinique": "Clinical reassessment",
  "Traitement cardio-reno-metabolique": "Cardiorenal-metabolic treatment",
  "Analogue incretinique": "Incretin-based option",
  "Mesure non pharmacologique": "Non-pharmacological measure",
  "Traitement de premiere intention frequemment utilise dans le diabete de type 2, surtout en presence de surpoids ou d'insulinoresistance.":
    "Frequently used first-line treatment in type 2 diabetes, especially with excess weight or insulin resistance.",
  "Peut etre raisonnable si le controle glycemique est adequat, si la tolerance est bonne et si les objectifs cliniques sont atteints.":
    "May be reasonable when glycemic control is adequate, tolerance is good, and clinical goals are being met.",
  "Option utile selon le profil cardio-reno-metabolique, notamment en presence de risque cardiovasculaire ou d'insuffisance cardiaque.":
    "Useful option depending on the cardiorenal-metabolic profile, especially with cardiovascular risk or heart failure.",
  "Peut etre discutee selon le poids, le risque cardiovasculaire, la tolerance et les objectifs glycemiques.":
    "May be discussed depending on weight, cardiovascular risk, tolerance, and glycemic goals.",
  "Utile dans tous les profils, avec adaptation aux capacites, preferences et risques du patient.":
    "Useful across profiles, adapted to the patient's abilities, preferences, and risks.",
  "Indapamide": "Indapamide",
  "Amlodipine": "Amlodipine",
  "Candesartan": "Candesartan",
  "Diuretique thiazidique-like": "Thiazide-like diuretic",
  "Inhibiteur calcique": "Calcium-channel blocker",
  "ARA-II": "ARB",
  "Efficace chez les patients hypertendus, surtout en cas de surcharge hydrosodée.":
    "Effective in patients with hypertension, especially with sodium and fluid overload.",
  "Bien tolérée, particulièrement utile chez les patients avec angor stable ou maladie coronarienne.":
    "Well tolerated, especially useful in patients with stable angina or coronary artery disease.",
  "Option privilégiée en cas de diabète ou de néphropathie, avec un bon profil de protection rénale (données simulées).":
    "Preferred option in diabetes or nephropathy, with a favorable renal-protection profile (simulated data).",
  "Larmes artificielles": "Artificial tears",
  "Optimisation optique": "Optical optimization",
  "Correction visuelle": "Visual correction",
  "Chirurgie de la cataracte": "Cataract surgery",
  "Lubrifiant oculaire": "Ocular lubricant",
  "Mesure conservative": "Conservative measure",
  "Traitement chirurgical": "Surgical treatment",
  "Bilan d'extension": "Staging workup",
  "Traitement systemique oncologique": "Oncologic systemic therapy",
  "Chimiotherapie": "Chemotherapy",
  "Soutien nutritionnel et symptomatique": "Nutritional and symptom support",
  "Evaluation initiale": "Initial evaluation",
  "Traitement oncologique": "Oncologic treatment",
  "Soins de support": "Supportive care",
  "Support clinique": "Clinical support",
  "Repos et hydratation": "Rest and hydration",
  "Repos": "Rest",
  "Antalgiques et antipyretiques": "Analgesics and antipyretics",
  "Antalgiques": "Analgesics",
  "Restriction des sports a risque": "Avoid high-risk sports",
  "Eviter les chocs": "Avoid impact",
  "Mesure supportive": "Supportive measure",
  "Traitement symptomatique": "Symptomatic treatment",
  "Prevention des complications": "Complication prevention",
  "Psychotherapie structuree": "Structured psychotherapy",
  "Psychotherapie": "Psychotherapy",
  "ISRS": "SSRI",
  "Mesures de sommeil et activation comportementale": "Sleep measures and behavioral activation",
  "Activation": "Activation",
  "Approche non pharmacologique": "Non-pharmacological approach",
  "Antidepresseur": "Antidepressant",
  "Quand orienter vers une evaluation ophtalmologique rapide ?":
    "When should the patient be referred for a prompt ophthalmologic evaluation?",
  "Donnees simulees : en cas de baisse de vision progressive limitant les activites, d'eblouissements importants ou de doute diagnostique avec une autre pathologie oculaire.":
    "Simulated data: when progressive vision loss limits activities, glare is significant, or another eye condition is suspected.",
  "Les gouttes peuvent-elles traiter une cataracte ?":
    "Can eye drops treat a cataract?",
  "Donnees simulees : non, les gouttes peuvent seulement ameliorer le confort si une secheresse oculaire est associee. Le traitement definitif reste chirurgical lorsque la cataracte devient invalidante.":
    "Simulated data: no. Eye drops may only improve comfort when dry eye is also present. Surgery remains the definitive treatment when the cataract becomes disabling.",
  "Quels elements de suivi surveiller ?":
    "Which follow-up elements should be monitored?",
  "Donnees simulees : impact fonctionnel, progression de la baisse de vision, tolerance a l'eblouissement et securite dans les activites comme la conduite.":
    "Simulated data: functional impact, progression of vision loss, glare tolerance, and safety during activities such as driving.",
  "Quelle est la prochaine etape apres le diagnostic ?":
    "What is the next step after diagnosis?",
  "Donnees simulees : organiser un bilan d'extension et une discussion multidisciplinaire afin de confirmer le stade et les options therapeutiques.":
    "Simulated data: arrange staging investigations and a multidisciplinary discussion to confirm the stage and treatment options.",
  "Quels risques cliniques doivent etre surveilles rapidement ?":
    "Which clinical risks require prompt monitoring?",
  "Donnees simulees : perte de poids importante, saignement digestif, obstruction, denutrition et deterioration de l'etat general.":
    "Simulated data: significant weight loss, gastrointestinal bleeding, obstruction, malnutrition, and deterioration in general condition.",
  "Quel est le role des soins de support ?":
    "What is the role of supportive care?",
  "Donnees simulees : ils sont essentiels des le depart pour la nutrition, le controle des symptomes et la tolerance aux traitements oncologiques.":
    "Simulated data: supportive care is essential from the outset for nutrition, symptom control, and tolerance of oncologic treatments.",
  "Pourquoi limiter les activites sportives ?":
    "Why should sports activities be limited?",
  "Donnees simulees : pour reduire le risque de complication splenique durant la phase aigue, surtout si la fatigue est importante ou si une splenomegalie est suspectee.":
    "Simulated data: to reduce the risk of splenic complications during the acute phase, especially with significant fatigue or suspected splenomegaly.",
  "Quand faut-il reevaluer plus rapidement ?":
    "When is a more prompt reassessment needed?",
  "Donnees simulees : en cas de dyspnee, douleur abdominale gauche, aggravation marquee de l'odynophagie ou incapacite a s'hydrater adequatement.":
    "Simulated data: with dyspnea, left-sided abdominal pain, marked worsening of painful swallowing, or inability to maintain adequate hydration.",
  "Les antibiotiques sont-ils utiles ?":
    "Are antibiotics useful?",
  "Donnees simulees : pas dans la mononucleose virale non compliquee, sauf si une autre infection bacterienne est documentee.":
    "Simulated data: not for uncomplicated viral mononucleosis, unless another bacterial infection is documented.",
  "Quel element doit etre reevaluer en priorite ?":
    "Which element should be reassessed first?",
  "Donnees simulees : la securite du patient, incluant la presence d'idees suicidaires, la capacite fonctionnelle et l'intensite des symptomes depressifs.":
    "Simulated data: patient safety, including suicidal thoughts, functional capacity, and the severity of depressive symptoms.",
  "Quand associer psychotherapie et traitement pharmacologique ?":
    "When should psychotherapy and pharmacological treatment be combined?",
  "Donnees simulees : l'association peut etre pertinente lorsque les symptomes sont moderes a severes, persistants ou associes a un retentissement fonctionnel important.":
    "Simulated data: combination treatment may be appropriate when symptoms are moderate to severe, persistent, or associated with significant functional impairment.",
  "Quel suivi initial est utile ?":
    "What initial follow-up is useful?",
  "Donnees simulees : un suivi rapproche au debut aide a verifier l'evolution, l'adherence, la tolerance et les facteurs de risque cliniques.":
    "Simulated data: close early follow-up helps assess progress, adherence, tolerance, and clinical risk factors.",
  "Quand poursuivre la strategie actuelle peut-il etre raisonnable ?":
    "When may continuing the current strategy be reasonable?",
  "Donnees simulees : si le controle glycemique est adequat, que la tolerance est bonne et que les objectifs cliniques sont atteints, il peut etre raisonnable de poursuivre la strategie actuelle avec surveillance.":
    "Simulated data: when glycemic control is adequate, tolerance is good, and clinical goals are met, continuing the current strategy with monitoring may be reasonable.",
  "Quand une reevaluation d'une option GLP-1 peut-elle etre discutee ?":
    "When may reassessment of a GLP-1 option be discussed?",
  "Donnees simulees : selon le poids, le profil cardio-metabolique, le risque cardiovasculaire, la tolerance au traitement actuel et les objectifs de controle glycemique.":
    "Simulated data: based on weight, cardiometabolic profile, cardiovascular risk, tolerance of current treatment, and glycemic-control goals.",
  "Quels elements de suivi sont utiles au moment de reevaluer le traitement ?":
    "Which follow-up elements are useful when reassessing treatment?",
  "Donnees simulees : l'evolution de la glycemie, la tolerance digestive, le poids, la fonction renale et les facteurs de risque cardiovasculaire meritent une reevaluation.":
    "Simulated data: changes in blood glucose, gastrointestinal tolerance, weight, renal function, and cardiovascular risk factors should be reassessed.",
  "Que faire si la tension reste élevée après 4 semaines de traitement ?":
    "What should be done if blood pressure remains elevated after four weeks of treatment?",
  "Données simulées : on recommande d'abord de vérifier l'adhésion, l'apport en sel, et la mesure à domicile. Ensuite, augmenter la dose ou ajouter un deuxième agent d'une autre classe peut être envisagé.":
    "Simulated data: first verify adherence, salt intake, and home measurements. Then consider increasing the dose or adding a second agent from another class.",
  "Quel traitement privilégier en cas de diabète de type 2 ?":
    "Which treatment should be preferred in type 2 diabetes?",
  "Données simulées : un ARA comme le candesartan est souvent privilégié pour sa protection rénale, mais cela dépend du profil global du patient et des lignes directrices locales.":
    "Simulated data: an ARB such as candesartan is often preferred for renal protection, depending on the patient's overall profile and local guidelines.",
  "Quelles sont les principales contre-indications à surveiller ?":
    "Which major contraindications should be monitored?",
  "Données simulées : insuffisance rénale avancée, hyperkaliémie, hypotension symptomatique et interactions médicamenteuses spécifiques selon l'agent choisi.":
    "Simulated data: advanced renal failure, hyperkalemia, symptomatic hypotension, and medication-specific interactions.",
};

export function getImmediateEnglishClinicalContent(text: string) {
  return ENGLISH_CLINICAL_CONTENT[text] || null;
}

export function shouldHideFrenchSourceInEnglish(text: string) {
  return /[éèêëàâîïôùûçÉÈÊËÀÂÎÏÔÙÛÇ]|\b(Donnees|Données|clinique|Traitement|Pertinence|Surveillance|strategie|therapeutique|glycemique|reevaluation|fonction renale|selon le contexte)\b/i.test(
    text
  );
}
