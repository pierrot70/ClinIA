import { UI_LABELS_FR } from "./uiLabels.fr";
import { baseUiLocale } from "./uiLocales";

type ExampleUi = { quickTitle: string; quickDisclaimer: string; patientTitle: string; medicationLabel: string; patientDisclaimer: string };
const ui: Record<string, ExampleUi> = {
  fr: { quickTitle: UI_LABELS_FR.quickModePanel.title, quickDisclaimer: UI_LABELS_FR.quickModePanel.disclaimer,
    patientTitle: UI_LABELS_FR.patientSummaryExample.panel.title, medicationLabel: UI_LABELS_FR.patientSummaryExample.panel.medicationLabel,
    patientDisclaimer: UI_LABELS_FR.patientSummaryExample.panel.disclaimer },
  en: { quickTitle: "Simulated recommendation", quickDisclaimer: "Example of an ultra-condensed format that ClinIA could generate from validated data. All information shown here is fictional.", patientTitle: "Example patient content", medicationLabel: "Selected simulated medication:", patientDisclaimer: "In a real project, this type of text would be personalized and written with physicians' input, then reviewed from clinical, ethical and legal perspectives." },
  es: { quickTitle: "Recomendación simulada", quickDisclaimer: "Ejemplo de un formato muy condensado que ClinIA podría generar a partir de datos validados. Toda la información mostrada aquí es ficticia.", patientTitle: "Ejemplo de contenido para el paciente", medicationLabel: "Medicamento simulado seleccionado:", patientDisclaimer: "En un proyecto real, este tipo de texto sería personalizado y redactado con el apoyo de médicos, y luego validado desde el punto de vista clínico, ético y legal." },
  ko: { quickTitle: "모의 권장 사항", quickDisclaimer: "검증된 데이터로 ClinIA가 생성할 수 있는 초간결 형식의 예입니다. 여기에 표시된 모든 정보는 가상입니다.", patientTitle: "환자용 내용 예시", medicationLabel: "선택한 모의 약물:", patientDisclaimer: "실제 프로젝트에서는 의사의 지원을 받아 이러한 문구를 개인화하여 작성하고, 임상적·윤리적·법적 관점에서 검증합니다." },
  vi: { quickTitle: "Khuyến nghị mô phỏng", quickDisclaimer: "Ví dụ về định dạng cực ngắn gọn mà ClinIA có thể tạo từ dữ liệu đã được xác nhận. Tất cả thông tin ở đây đều là hư cấu.", patientTitle: "Ví dụ nội dung dành cho bệnh nhân", medicationLabel: "Thuốc mô phỏng đã chọn:", patientDisclaimer: "Trong dự án thực tế, loại văn bản này sẽ được cá nhân hóa và soạn với sự hỗ trợ của bác sĩ, sau đó được xác nhận về mặt lâm sàng, đạo đức và pháp lý." },
  no: { quickTitle: "Simulert anbefaling", quickDisclaimer: "Eksempel på et svært kort format som ClinIA kan generere fra validerte data. Alle opplysninger som vises her, er fiktive.", patientTitle: "Eksempel på innhold for pasienten", medicationLabel: "Valgt simulert legemiddel:", patientDisclaimer: "I et virkelig prosjekt ville denne typen tekst blitt tilpasset og skrevet med støtte fra leger, og deretter validert fra et klinisk, etisk og juridisk perspektiv." },
  ja: { quickTitle: "模擬の推奨", quickDisclaimer: "ClinIAが検証済みデータから生成できる非常に簡潔な形式の例です。ここに表示される情報はすべて架空です。", patientTitle: "患者向け内容の例", medicationLabel: "選択した模擬の薬剤:", patientDisclaimer: "実際のプロジェクトでは、このような文面を医師の協力で個別化して作成し、臨床・倫理・法律の観点から検証します。" },
  zh: { quickTitle: "模拟推荐", quickDisclaimer: "这是ClinIA可根据已验证数据生成的极简格式示例。此处显示的所有信息均为虚构。", patientTitle: "患者内容示例", medicationLabel: "所选模拟药物：", patientDisclaimer: "在实际项目中，此类文本将由医生协助进行个性化编写，然后从临床、伦理和法律角度加以验证。" },
  he: { quickTitle: "המלצה מדומה", quickDisclaimer: "דוגמה לפורמט תמציתי מאוד ש־ClinIA עשויה ליצור מנתונים מאומתים. כל המידע המוצג כאן בדיוני.", patientTitle: "דוגמה לתוכן למטופל", medicationLabel: "התרופה המדומה שנבחרה:", patientDisclaimer: "בפרויקט אמיתי, טקסט מסוג זה יותאם אישית וייכתב בסיוע רופאים, ואז ייבדק מבחינה קלינית, אתית ומשפטית." },
};
export function getExampleUiLabels(locale: string): ExampleUi {
  return ui[baseUiLocale(locale)] ?? ui.en;
}
export function localizeExampleUiLabel(source: string, locale: string): string | null {
  const entry = Object.entries(ui.fr).find(([, french]) => french === source);
  if (!entry) return null;
  return ui[baseUiLocale(locale)]?.[entry[0] as keyof ExampleUi] ?? null;
}
