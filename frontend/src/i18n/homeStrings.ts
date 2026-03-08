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
    title: "診断のたびに時間を節約。",
    subtitle:
      "ClinIA は診断結果にもとづき、有効性・忍容性・最新エビデンスで治療選択肢を整理し、匿名化された臨床入力から数秒で分かりやすく提示します。",
    disclaimer: "シミュレーションデータによるプロトタイプであり、実臨床には使用できません。",
    cardReadTitle: "6秒で読める",
    cardReadBody:
      "超要約: 推奨治療 1 件、代替案 2 件、重要ポイント 3 行をすばやく確認できます。",
    cardChartsTitle: "見やすいグラフ",
    cardChartsBody:
      "有効性比較、副作用プロファイル、臨床的妥当性を一目で把握できます。",
    cardQuestionsTitle: "想定される質問",
    cardQuestionsBody:
      "よくある質問を提示し、構造化された回答で認知負荷を軽減します。",
  },
  search: {
    secureModeHint:
      "クイックモード: 匿名化された臨床情報のみ入力します。詳細設定は任意です。",
    objectiveLabel: "目的",
    showAdvanced: "詳細設定を表示",
    hideAdvanced: "詳細設定を非表示",
    scopeLabel: "診療科",
    ageGroupLabel: "患者グループ",
    symptomLabel: "主症状",
    durationLabel: "症状の期間",
    severityLabel: "重症度",
    redFlagsLabel: "レッドフラッグ",
    comorbidityLabel: "併存疾患",
    notesLabel: "臨床メモ",
    notesPlaceholder: "匿名化された臨床メモ（患者識別情報なし）",
    launchSecure: "安全クエリを実行",
    checkAttestation: "誓約を確認",
    attestationRequiredHint:
      "送信前に必須: 下記の誓約にチェックするとボタンが有効になります。",
    attestationText:
      "この入力は匿名化されており、患者識別情報（氏名、RAMQ、生年月日、電話、メール、住所）を含まないことを確認します。",
    privacyFooter:
      "ClinIA は個人識別情報を必要としません。氏名、RAMQ、電話、メール、生年月日、住所は入力しないでください。",
    privacyConfirmRequired: "送信前にプライバシー誓約を確認してください。",
    sensitiveDetected: "警告: 機微情報の可能性を検出しました",
    voiceSensitiveDetected: "警告: 音声入力に機微情報が含まれる可能性があります",
    blockedSensitive:
      "入力はブロックされました。個人情報（氏名、RAMQ、電話、メール）を削除してから続行してください。",
  },
  options: {
    objectives: ["初期治療", "治療調整", "不耐時の代替", "モニタリングとフォローアップ"],
    clinicalScopes: ["総合診療", "循環器", "神経内科", "精神科", "老年医学"],
    ageGroups: ["成人", "小児", "高齢者", "妊娠"],
    symptomProfiles: [
      "高血圧",
      "慢性疼痛",
      "片頭痛",
      "不安",
      "不眠",
      "呼吸器感染",
    ],
    durations: ["< 24時間", "1-7日", "1-4週間", "> 1か月"],
    severityLevels: ["軽度", "中等度", "重度"],
    redFlagStatuses: ["警告徴候なし", "警告徴候あり"],
    comorbidityContexts: [
      "重大な併存疾患なし",
      "腎機能障害",
      "肝機能障害",
      "高心血管リスク",
      "多剤併用",
    ],
  },
};

export const HOME_STRINGS_HE: HomeStrings = {
  ...HOME_STRINGS_EN,
  home: {
    title: "חסכו זמן אחרי כל אבחנה.",
    subtitle:
      "ClinIA מציעה מתוך האבחנה אפשרויות טיפול מדורגות לפי יעילות, סבילות ועדכניות הראיות, ומציגה סיכום ברור בתוך שניות עם קלט קליני אנונימי.",
    disclaimer: "אב-טיפוס עם נתונים מדומים - לא מיועד לשימוש קליני אמיתי.",
    cardReadTitle: "קריאה של 6 שניות",
    cardReadBody:
      "סיכום תמציתי: טיפול מומלץ אחד, שתי חלופות ושלוש שורות עם עיקרי הדברים.",
    cardChartsTitle: "גרפים ברורים",
    cardChartsBody:
      "השוואת יעילות, פרופיל תופעות לוואי ורלוונטיות קלינית במבט אחד.",
    cardQuestionsTitle: "שאלות צפויות",
    cardQuestionsBody:
      "הממשק מציע שאלות נפוצות ומציג תשובות מובנות להפחתת העומס הקוגניטיבי.",
  },
  search: {
    secureModeHint:
      "מצב מהיר: קלט קליני אנונימי בלבד. הגדרות מתקדמות הן אופציונליות.",
    objectiveLabel: "מטרה",
    showAdvanced: "הצג הגדרות מתקדמות",
    hideAdvanced: "הסתר הגדרות מתקדמות",
    scopeLabel: "תחום התמחות",
    ageGroupLabel: "קבוצת מטופל",
    symptomLabel: "תסמין עיקרי",
    durationLabel: "משך התסמינים",
    severityLabel: "חומרה",
    redFlagsLabel: "דגלים אדומים",
    comorbidityLabel: "רקע של תחלואה נלווית",
    notesLabel: "הערות קליניות",
    notesPlaceholder: "הערות קליניות אנונימיות (ללא מזהה מטופל)",
    launchSecure: "הפעל שאילתה מאובטחת",
    checkAttestation: "סמנו את ההצהרה",
    attestationRequiredHint:
      "חובה לפני שליחה: סמנו את ההצהרה למטה כדי להפעיל את הכפתור.",
    attestationText:
      "אני מאשר/ת שהקלט אנונימי ואינו כולל מזהה מטופל (שם, RAMQ, תאריך לידה, טלפון, אימייל, כתובת).",
    privacyFooter:
      "ClinIA אינה דורשת נתונים מזהים: אין להזין שם, RAMQ, טלפון, אימייל, תאריך לידה או כתובת.",
    privacyConfirmRequired: "נא לאשר את הצהרת הפרטיות לפני השליחה.",
    sensitiveDetected: "אזהרה: זוהה תוכן רגיש אפשרי",
    voiceSensitiveDetected: "אזהרה: זוהה תוכן מוכתב שעשוי להיות רגיש",
    blockedSensitive:
      "הקלט נחסם: הסירו כל מידע אישי (שם, RAMQ, טלפון, אימייל) לפני ההמשך.",
  },
  options: {
    objectives: ["טיפול התחלתי", "התאמת טיפול", "חלופה במקרה של אי-סבילות", "ניטור ומעקב"],
    clinicalScopes: ["רפואה כללית", "קרדיולוגיה", "נוירולוגיה", "פסיכיאטריה", "גריאטריה"],
    ageGroups: ["מבוגר", "ילדים", "גריאטרי", "הריון"],
    symptomProfiles: [
      "יתר לחץ דם",
      "כאב כרוני",
      "מיגרנה",
      "חרדה",
      "נדודי שינה",
      "זיהום נשימתי",
    ],
    durations: ["< 24 שעות", "1-7 ימים", "1-4 שבועות", "> חודש"],
    severityLevels: ["קל", "בינוני", "חמור"],
    redFlagStatuses: ["ללא סימן אזהרה", "קיימים סימני אזהרה"],
    comorbidityContexts: [
      "ללא תחלואה נלווית משמעותית",
      "אי-ספיקת כליות",
      "אי-ספיקת כבד",
      "סיכון קרדיו-וסקולרי גבוה",
      "ריבוי תרופות",
    ],
  },
};

export const HOME_STRINGS_KO: HomeStrings = {
  ...HOME_STRINGS_EN,
  home: {
    title: "진단 후 매번 시간을 절약하세요.",
    subtitle:
      "ClinIA는 진단을 바탕으로 효과, 내약성, 최신 근거에 따라 치료 옵션을 정리해 익명화된 임상 입력으로 몇 초 안에 명확한 요약을 제공합니다.",
    disclaimer: "시뮬레이션 데이터 기반 프로토타입이며 실제 임상 진료용이 아닙니다.",
    cardReadTitle: "6초 읽기",
    cardReadBody:
      "초간단 요약: 권장 치료 1개, 대안 2개, 핵심 포인트 3줄로 빠르게 파악합니다.",
    cardChartsTitle: "명확한 차트",
    cardChartsBody:
      "효과 비교, 부작용 프로필, 임상적 적합성을 한눈에 확인할 수 있습니다.",
    cardQuestionsTitle: "예상 질문",
    cardQuestionsBody:
      "자주 묻는 질문을 제안하고 구조화된 답변을 제공해 인지 부담을 줄입니다.",
  },
  search: {
    secureModeHint:
      "빠른 모드: 익명화된 임상 정보만 입력합니다. 고급 설정은 선택 사항입니다.",
    objectiveLabel: "목표",
    showAdvanced: "고급 설정 표시",
    hideAdvanced: "고급 설정 숨기기",
    scopeLabel: "전문 분야",
    ageGroupLabel: "환자 그룹",
    symptomLabel: "주요 증상",
    durationLabel: "증상 기간",
    severityLabel: "중증도",
    redFlagsLabel: "위험 신호",
    comorbidityLabel: "동반질환 맥락",
    notesLabel: "임상 메모",
    notesPlaceholder: "익명화된 임상 메모 (환자 식별 정보 없음)",
    launchSecure: "보안 질의 실행",
    checkAttestation: "확인 문구 체크",
    attestationRequiredHint:
      "전송 전 필수: 아래 확인 문구를 체크하면 버튼이 활성화됩니다.",
    attestationText:
      "이 입력은 익명화되었으며 환자 식별 정보(이름, RAMQ, 생년월일, 전화번호, 이메일, 주소)를 포함하지 않음을 확인합니다.",
    privacyFooter:
      "ClinIA는 개인 식별 정보를 요구하지 않습니다. 이름, RAMQ, 전화번호, 이메일, 생년월일, 주소를 입력하지 마세요.",
    privacyConfirmRequired: "전송 전에 개인정보 확인 문구를 확인해 주세요.",
    sensitiveDetected: "경고: 민감한 내용이 감지되었을 수 있습니다",
    voiceSensitiveDetected: "경고: 음성 입력에 민감한 정보가 포함되었을 수 있습니다",
    blockedSensitive:
      "입력이 차단되었습니다: 계속하기 전에 개인정보(이름, RAMQ, 전화번호, 이메일)를 제거해 주세요.",
  },
  options: {
    objectives: ["초기 치료", "치료 조정", "불내성 시 대안", "모니터링 및 추적"],
    clinicalScopes: ["일반의학", "심장내과", "신경과", "정신건강의학과", "노인의학"],
    ageGroups: ["성인", "소아", "노인", "임신"],
    symptomProfiles: ["고혈압", "만성 통증", "편두통", "불안", "불면", "호흡기 감염"],
    durations: ["< 24시간", "1-7일", "1-4주", "> 1개월"],
    severityLevels: ["경증", "중등도", "중증"],
    redFlagStatuses: ["위험 신호 없음", "위험 신호 있음"],
    comorbidityContexts: [
      "중대한 동반질환 없음",
      "신장 기능 저하",
      "간 기능 저하",
      "높은 심혈관 위험",
      "다제복용",
    ],
  },
};

export const HOME_STRINGS_VI: HomeStrings = {
  ...HOME_STRINGS_EN,
  home: {
    title: "Tiet kiem thoi gian sau moi chan doan.",
    subtitle:
      "ClinIA de xuat cac lua chon dieu tri dua tren chan doan, sap xep theo hieu qua, kha nang dung nap va bang chung hien tai, trinh bay trong vai giay voi du lieu lam sang da an danh.",
    disclaimer: "Nguyen mau voi du lieu mo phong - khong dung cho thuc hanh lam sang thuc te.",
    cardReadTitle: "Doc trong 6 giay",
    cardReadBody:
      "Tom tat cuc ngan: 1 dieu tri de xuat, 2 phuong an thay the, 3 dong de nam y chinh.",
    cardChartsTitle: "Bieu do ro rang",
    cardChartsBody:
      "So sanh hieu qua, tac dung phu va muc do phu hop lam sang trong mot cai nhin.",
    cardQuestionsTitle: "Cau hoi du kien",
    cardQuestionsBody:
      "Giao dien goi y cau hoi thuong gap va hien thi cau tra loi co cau truc de giam tai nhan thuc.",
  },
  search: {
    secureModeHint:
      "Che do nhanh: chi nhap du lieu lam sang da an danh. Cac tuy chon nang cao la tuy chon.",
    objectiveLabel: "Muc tieu",
    showAdvanced: "Hien thi tuy chon nang cao",
    hideAdvanced: "An tuy chon nang cao",
    scopeLabel: "Chuyen khoa",
    ageGroupLabel: "Nhom benh nhan",
    symptomLabel: "Trieu chung chinh",
    durationLabel: "Thoi gian trieu chung",
    severityLabel: "Muc do nang",
    redFlagsLabel: "Dau hieu bao dong",
    comorbidityLabel: "Boi canh benh dong mac",
    notesLabel: "Ghi chu lam sang",
    notesPlaceholder: "Ghi chu lam sang da an danh (khong co dinh danh benh nhan)",
    launchSecure: "Chay truy van bao mat",
    checkAttestation: "Danh dau cam ket",
    attestationRequiredHint:
      "Bat buoc truoc khi gui: danh dau cam ket ben duoi de kich hoat nut.",
    attestationText:
      "Toi xac nhan du lieu nay da duoc an danh va khong chua thong tin dinh danh benh nhan (ten, RAMQ, ngay sinh, so dien thoai, email, dia chi).",
    privacyFooter:
      "ClinIA khong yeu cau du lieu dinh danh: khong nhap ten, RAMQ, so dien thoai, email, ngay sinh hoac dia chi.",
    privacyConfirmRequired: "Vui long xac nhan cam ket bao mat truoc khi gui.",
    sensitiveDetected: "Canh bao: co the da phat hien noi dung nhay cam",
    voiceSensitiveDetected: "Canh bao: noi dung doc co the chua thong tin nhay cam",
    blockedSensitive:
      "Da chan du lieu nhap: hay xoa thong tin ca nhan (ten, RAMQ, so dien thoai, email) truoc khi tiep tuc.",
  },
  options: {
    objectives: ["Dieu tri ban dau", "Dieu chinh dieu tri", "Thay the khi khong dung nap", "Theo doi va tai kham"],
    clinicalScopes: ["Y hoc tong quat", "Tim mach", "Than kinh", "Tam than", "Lao khoa"],
    ageGroups: ["Nguoi lon", "Nhi khoa", "Nguoi cao tuoi", "Thai ky"],
    symptomProfiles: ["Tang huyet ap", "Dau man tinh", "Dau nua dau", "Lo au", "Mat ngu", "Nhiem trung ho hap"],
    durations: ["< 24 gio", "1-7 ngay", "1-4 tuan", "> 1 thang"],
    severityLevels: ["Nhe", "Trung binh", "Nang"],
    redFlagStatuses: ["Khong co dau hieu bao dong", "Co dau hieu bao dong"],
    comorbidityContexts: [
      "Khong co benh dong mac dang ke",
      "Suy than",
      "Suy gan",
      "Nguy co tim mach cao",
      "Da dung thuoc",
    ],
  },
};
