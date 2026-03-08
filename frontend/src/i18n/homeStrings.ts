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

export const HOME_STRINGS_ZH: HomeStrings = {
  home: {
    title: "每次诊断后节省时间。",
    subtitle:
      "ClinIA 可根据诊断结果，按疗效、耐受性与当前证据排序给出治疗方案，并在数秒内以清晰摘要呈现，且仅使用匿名临床输入。",
    disclaimer: "原型系统，使用模拟数据，不用于真实临床实践。",
    cardReadTitle: "6 秒阅读",
    cardReadBody:
      "超精简摘要：1 个推荐方案、2 个替代方案、3 句核心结论。",
    cardChartsTitle: "清晰图表",
    cardChartsBody:
      "疗效对比、不良反应特征与临床相关性一目了然。",
    cardQuestionsTitle: "预判问题",
    cardQuestionsBody:
      "界面会建议常见问题并给出结构化答案，降低认知负担。",
  },
  search: {
    secureModeHint:
      "快速模式：仅输入匿名临床信息。高级参数为可选。",
    objectiveLabel: "目标",
    showAdvanced: "显示高级参数",
    hideAdvanced: "隐藏高级参数",
    scopeLabel: "专科",
    ageGroupLabel: "患者分组",
    symptomLabel: "主要症状",
    durationLabel: "症状持续时间",
    severityLabel: "严重程度",
    redFlagsLabel: "危险信号",
    comorbidityLabel: "合并症背景",
    notesLabel: "临床备注",
    notesPlaceholder: "匿名临床备注（不含患者身份信息）",
    launchSecure: "启动安全查询",
    checkAttestation: "勾选声明",
    attestationRequiredHint:
      "提交前必填：请勾选下方声明以启用按钮。",
    attestationText:
      "我确认本次输入已匿名，且不包含任何患者身份信息（姓名、RAMQ、出生日期、电话、邮箱、地址）。",
    privacyFooter:
      "ClinIA 不需要任何实名数据：请勿输入姓名、RAMQ、电话、邮箱、出生日期或地址。",
    privacyConfirmRequired: "发送前请确认隐私声明。",
    sensitiveDetected: "警告：可能检测到敏感内容",
    voiceSensitiveDetected: "警告：语音输入可能包含敏感内容",
    blockedSensitive:
      "输入已阻止：请先移除所有个人信息（姓名、RAMQ、电话、邮箱）后再继续。",
  },
  options: {
    objectives: [
      "初始治疗",
      "治疗方案调整",
      "不耐受时替代方案",
      "监测与随访",
    ],
    clinicalScopes: ["全科医学", "心脏科", "神经科", "精神科", "老年医学"],
    ageGroups: ["成人", "儿科", "老年", "妊娠"],
    symptomProfiles: [
      "高血压",
      "慢性疼痛",
      "偏头痛",
      "焦虑",
      "失眠",
      "呼吸道感染",
    ],
    durations: ["< 24 小时", "1-7 天", "1-4 周", "> 1 个月"],
    severityLevels: ["轻度", "中度", "重度"],
    redFlagStatuses: ["无危险信号", "存在危险信号"],
    comorbidityContexts: [
      "无重大合并症",
      "肾功能不全",
      "肝功能不全",
      "高心血管风险",
      "多重用药",
    ],
  },
};

export const HOME_STRINGS_ES: HomeStrings = {
  ...HOME_STRINGS_EN,
  home: {
    ...HOME_STRINGS_EN.home,
    title: "Ahorra tiempo despues de cada diagnostico.",
    cardReadTitle: "Lectura de 6 segundos",
    cardChartsTitle: "Graficos claros",
    cardQuestionsTitle: "Preguntas anticipadas",
  },
  search: {
    ...HOME_STRINGS_EN.search,
    objectiveLabel: "Objetivo",
    showAdvanced: "Mostrar parametros avanzados",
    hideAdvanced: "Ocultar parametros avanzados",
    scopeLabel: "Especialidad",
    ageGroupLabel: "Grupo de paciente",
    symptomLabel: "Sintoma principal",
    durationLabel: "Duracion de sintomas",
    severityLabel: "Severidad",
    redFlagsLabel: "Senales de alarma",
    comorbidityLabel: "Contexto de comorbilidades",
    notesLabel: "Notas clinicas",
    launchSecure: "Ejecutar consulta segura",
  },
};

export const HOME_STRINGS_JA: HomeStrings = {
  ...HOME_STRINGS_EN,
  home: {
    ...HOME_STRINGS_EN.home,
    title: "Shindan goto ni jikan o setuyaku.",
    cardReadTitle: "6-byo de yomeru",
    cardChartsTitle: "Wakariyasui gurafu",
    cardQuestionsTitle: "Yokuaru shitsumon",
  },
  search: {
    ...HOME_STRINGS_EN.search,
    objectiveLabel: "Mokuteki",
    showAdvanced: "Shosai settei o hyouji",
    hideAdvanced: "Shosai settei o kakusu",
    scopeLabel: "Senmon bumon",
    ageGroupLabel: "Kanja gurupu",
    symptomLabel: "Omona shoujou",
    durationLabel: "Shoujou no kikan",
    severityLabel: "Juushoudo",
    redFlagsLabel: "Kiken shingou",
    comorbidityLabel: "Heisonshou jouhou",
    notesLabel: "Rinsho memo",
    launchSecure: "Anzen na kensaku o jikkou",
  },
};

export const HOME_STRINGS_HE: HomeStrings = {
  ...HOME_STRINGS_EN,
  home: {
    ...HOME_STRINGS_EN.home,
    title: "Chasoch zman achar kol tashkik.",
    cardReadTitle: "Kri'a shel 6 shniyot",
    cardChartsTitle: "Grafim berurim",
    cardQuestionsTitle: "Sheelot metzukot",
  },
  search: {
    ...HOME_STRINGS_EN.search,
    objectiveLabel: "Matarah",
    showAdvanced: "Hatzeg hagdarot mitkadmot",
    hideAdvanced: "Haster hagdarot mitkadmot",
    scopeLabel: "Tchum hitmachut",
    ageGroupLabel: "Kvutzat metupal",
    symptomLabel: "Simptom ikari",
    durationLabel: "Meshech simptomim",
    severityLabel: "Chomer",
    redFlagsLabel: "Simanei azhara",
    comorbidityLabel: "Reka shel comorbidity",
    notesLabel: "He'arot kliniyot",
    launchSecure: "Haratz sh'eilta meuvtachat",
  },
};

export const HOME_STRINGS_KO: HomeStrings = {
  ...HOME_STRINGS_EN,
  home: {
    ...HOME_STRINGS_EN.home,
    title: "Mae jinadan hu siganeul jeol-yak-haseyo.",
    cardReadTitle: "6cho ilggi",
    cardChartsTitle: "Myeonghwakan geuraep",
    cardQuestionsTitle: "Yecheugdoen jilmun",
  },
  search: {
    ...HOME_STRINGS_EN.search,
    objectiveLabel: "Mogpyo",
    showAdvanced: "Gogeup seoljeong pyosi",
    hideAdvanced: "Gogeup seoljeong sumgim",
    scopeLabel: "Jeonmun bunya",
    ageGroupLabel: "Hwanja geurup",
    symptomLabel: "Juyo jeungsang",
    durationLabel: "Jeungsang gigan",
    severityLabel: "Simgakdo",
    redFlagsLabel: "Jeoksaek sinho",
    comorbidityLabel: "Dongban jilhwahn baegyeong",
    notesLabel: "Imsang memo",
    launchSecure: "Boan jilhui silhaeng",
  },
};
