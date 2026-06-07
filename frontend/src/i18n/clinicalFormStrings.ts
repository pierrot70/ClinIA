export type ClinicalFormReviewedStrings = {
  clinicalParametersTitle: string;
  clinicalParametersHelp: string;
  exampleCaseRequiredHint: string;
  exampleCaseSelectionRequired: string;
  agePlaceholder: string;
  diagnosisPlaceholder: string;
  weightPlaceholder: string;
  heightPlaceholder: string;
  symptomsPlaceholder: string;
  medicalHistoryPlaceholder: string;
  medicationsPlaceholder: string;
};

const CLINICAL_FORM_STRINGS: Record<string, ClinicalFormReviewedStrings> = {
  fr: {
    clinicalParametersTitle: "Définir les paramètres cliniques de l'analyse",
    clinicalParametersHelp:
      "ClinIA utilise ces paramètres pour préparer une requête clinique minimisée transmise à OpenAI.",
    exampleCaseRequiredHint:
      "Commencez par choisir un cas exemple pour préremplir rapidement le formulaire, puis ajustez les champs selon votre patient.",
    exampleCaseSelectionRequired:
      "Le reste du formulaire apparaîtra après la sélection d'un cas exemple.",
    agePlaceholder: "Ex. : 55",
    diagnosisPlaceholder: "Ex. : cancer gastrique",
    weightPlaceholder: "Ex. : 92",
    heightPlaceholder: "Ex. : 175",
    symptomsPlaceholder: "Ex. : fatigue, polyurie",
    medicalHistoryPlaceholder: "Ex. : diabète, hypertension",
    medicationsPlaceholder: "Ex. : metformine, insuline",
  },
  en: {
    clinicalParametersTitle: "Define the clinical parameters for the analysis",
    clinicalParametersHelp:
      "ClinIA uses these parameters to prepare a minimized clinical request sent to OpenAI.",
    exampleCaseRequiredHint:
      "Start by selecting an example case to quickly prefill the form, then adjust the fields for your patient.",
    exampleCaseSelectionRequired:
      "The rest of the form will appear after you select an example case.",
    agePlaceholder: "Example: 55",
    diagnosisPlaceholder: "Example: gastric cancer",
    weightPlaceholder: "Example: 92",
    heightPlaceholder: "Example: 175",
    symptomsPlaceholder: "Example: fatigue, polyuria",
    medicalHistoryPlaceholder: "Example: diabetes, hypertension",
    medicationsPlaceholder: "Example: metformin, insulin",
  },
  es: {
    clinicalParametersTitle: "Definir los parámetros clínicos del análisis",
    clinicalParametersHelp:
      "ClinIA utiliza estos parámetros para preparar una solicitud clínica minimizada que se envía a OpenAI.",
    exampleCaseRequiredHint:
      "Seleccione primero un caso de ejemplo para completar rápidamente el formulario y luego ajuste los campos para su paciente.",
    exampleCaseSelectionRequired:
      "El resto del formulario aparecerá después de seleccionar un caso de ejemplo.",
    agePlaceholder: "Ejemplo: 55",
    diagnosisPlaceholder: "Ejemplo: cáncer gástrico",
    weightPlaceholder: "Ejemplo: 92",
    heightPlaceholder: "Ejemplo: 175",
    symptomsPlaceholder: "Ejemplo: fatiga, poliuria",
    medicalHistoryPlaceholder: "Ejemplo: diabetes, hipertensión",
    medicationsPlaceholder: "Ejemplo: metformina, insulina",
  },
  ja: {
    clinicalParametersTitle: "解析用の臨床パラメータを設定",
    clinicalParametersHelp:
      "ClinIAはこれらのパラメータを使用して、OpenAIに送信する必要最小限の臨床リクエストを作成します。",
    exampleCaseRequiredHint:
      "症例例を選択してフォームをすばやく入力し、患者に合わせて各項目を調整してください。",
    exampleCaseSelectionRequired:
      "症例例を選択すると、フォームの残りの項目が表示されます。",
    agePlaceholder: "例：55",
    diagnosisPlaceholder: "例：胃がん",
    weightPlaceholder: "例：92",
    heightPlaceholder: "例：175",
    symptomsPlaceholder: "例：倦怠感、多尿",
    medicalHistoryPlaceholder: "例：糖尿病、高血圧",
    medicationsPlaceholder: "例：メトホルミン、インスリン",
  },
  zh: {
    clinicalParametersTitle: "定义分析所需的临床参数",
    clinicalParametersHelp:
      "ClinIA 使用这些参数准备发送给 OpenAI 的最小化临床请求。",
    exampleCaseRequiredHint:
      "请先选择一个示例病例以快速预填表单，然后根据患者情况调整各字段。",
    exampleCaseSelectionRequired: "选择示例病例后，将显示表单的其余部分。",
    agePlaceholder: "示例：55",
    diagnosisPlaceholder: "示例：胃癌",
    weightPlaceholder: "示例：92",
    heightPlaceholder: "示例：175",
    symptomsPlaceholder: "示例：疲劳、多尿",
    medicalHistoryPlaceholder: "示例：糖尿病、高血压",
    medicationsPlaceholder: "示例：二甲双胍、胰岛素",
  },
  he: {
    clinicalParametersTitle: "הגדרת הפרמטרים הקליניים לניתוח",
    clinicalParametersHelp:
      "ClinIA משתמשת בפרמטרים אלה כדי להכין בקשה קלינית מצומצמת הנשלחת ל-OpenAI.",
    exampleCaseRequiredHint:
      "בחרו תחילה מקרה לדוגמה למילוי מהיר של הטופס, ולאחר מכן התאימו את השדות למטופל.",
    exampleCaseSelectionRequired: "שאר הטופס יוצג לאחר בחירת מקרה לדוגמה.",
    agePlaceholder: "לדוגמה: 55",
    diagnosisPlaceholder: "לדוגמה: סרטן קיבה",
    weightPlaceholder: "לדוגמה: 92",
    heightPlaceholder: "לדוגמה: 175",
    symptomsPlaceholder: "לדוגמה: עייפות, השתנה מרובה",
    medicalHistoryPlaceholder: "לדוגמה: סוכרת, יתר לחץ דם",
    medicationsPlaceholder: "לדוגמה: מטפורמין, אינסולין",
  },
  ko: {
    clinicalParametersTitle: "분석을 위한 임상 매개변수 정의",
    clinicalParametersHelp:
      "ClinIA는 이 매개변수를 사용하여 OpenAI로 전송할 최소화된 임상 요청을 준비합니다.",
    exampleCaseRequiredHint:
      "예시 사례를 선택해 양식을 빠르게 채운 다음 환자에 맞게 각 항목을 조정하세요.",
    exampleCaseSelectionRequired: "예시 사례를 선택하면 나머지 양식이 표시됩니다.",
    agePlaceholder: "예: 55",
    diagnosisPlaceholder: "예: 위암",
    weightPlaceholder: "예: 92",
    heightPlaceholder: "예: 175",
    symptomsPlaceholder: "예: 피로, 다뇨",
    medicalHistoryPlaceholder: "예: 당뇨병, 고혈압",
    medicationsPlaceholder: "예: 메트포르민, 인슐린",
  },
  vi: {
    clinicalParametersTitle: "Xác định các thông số lâm sàng cho phân tích",
    clinicalParametersHelp:
      "ClinIA sử dụng các thông số này để chuẩn bị yêu cầu lâm sàng tối giản gửi đến OpenAI.",
    exampleCaseRequiredHint:
      "Trước tiên, hãy chọn một ca mẫu để điền nhanh biểu mẫu, sau đó điều chỉnh các trường theo bệnh nhân.",
    exampleCaseSelectionRequired:
      "Phần còn lại của biểu mẫu sẽ xuất hiện sau khi bạn chọn một ca mẫu.",
    agePlaceholder: "Ví dụ: 55",
    diagnosisPlaceholder: "Ví dụ: ung thư dạ dày",
    weightPlaceholder: "Ví dụ: 92",
    heightPlaceholder: "Ví dụ: 175",
    symptomsPlaceholder: "Ví dụ: mệt mỏi, đa niệu",
    medicalHistoryPlaceholder: "Ví dụ: tiểu đường, tăng huyết áp",
    medicationsPlaceholder: "Ví dụ: metformin, insulin",
  },
  no: {
    clinicalParametersTitle: "Definer kliniske parametere for analysen",
    clinicalParametersHelp:
      "ClinIA bruker disse parameterne til å forberede en minimert klinisk forespørsel som sendes til OpenAI.",
    exampleCaseRequiredHint:
      "Velg først et eksempeltilfelle for å fylle ut skjemaet raskt, og tilpass deretter feltene til pasienten.",
    exampleCaseSelectionRequired:
      "Resten av skjemaet vises etter at du har valgt et eksempeltilfelle.",
    agePlaceholder: "Eksempel: 55",
    diagnosisPlaceholder: "Eksempel: magekreft",
    weightPlaceholder: "Eksempel: 92",
    heightPlaceholder: "Eksempel: 175",
    symptomsPlaceholder: "Eksempel: tretthet, polyuri",
    medicalHistoryPlaceholder: "Eksempel: diabetes, hypertensjon",
    medicationsPlaceholder: "Eksempel: metformin, insulin",
  },
};

export const getClinicalFormReviewedStrings = (
  locale: string
): ClinicalFormReviewedStrings =>
  CLINICAL_FORM_STRINGS[String(locale || "fr").toLowerCase().split("-")[0]] ||
  CLINICAL_FORM_STRINGS.en;
