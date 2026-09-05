import { UI_LABELS_FR } from "./uiLabels.fr";

export const PATIENT_SUMMARY_HEADER_EN: Record<keyof Pick<typeof UI_LABELS_FR.patientSummaryExample, "title" | "description">, string> = {
    title: "Patient summary (example)",
    description: "This page illustrates how ClinIA could eventually prefill a summary to share with the patient or add to the medical record. All displayed data is simulated.",
};

export const patientSummaryHeaders: Record<string, typeof PATIENT_SUMMARY_HEADER_EN> = {
    fr: { title: UI_LABELS_FR.patientSummaryExample.title, description: UI_LABELS_FR.patientSummaryExample.description },
    en: PATIENT_SUMMARY_HEADER_EN,
    es: { title: "Resumen del paciente (ejemplo)", description: "Esta página ilustra cómo ClinIA podría, en el futuro, completar previamente un resumen para compartir con el paciente o incorporar a su historia clínica. Todos los datos mostrados son simulados." },
    ko: { title: "환자 요약 (예시)", description: "이 페이지는 향후 ClinIA가 환자와 공유하거나 의무 기록에 추가할 요약을 미리 작성하는 방식을 보여줍니다. 표시된 모든 데이터는 모의 데이터입니다." },
    vi: { title: "Tóm tắt bệnh nhân (ví dụ)", description: "Trang này minh họa cách ClinIA có thể điền sẵn bản tóm tắt trong tương lai để chia sẻ với bệnh nhân hoặc đưa vào hồ sơ y tế. Tất cả dữ liệu hiển thị đều là dữ liệu mô phỏng." },
    no: { title: "Pasientsammendrag (eksempel)", description: "Denne siden viser hvordan ClinIA på sikt kan forhåndsutfylle et sammendrag som kan deles med pasienten eller legges til i journalen. Alle viste data er simulerte." },
    ja: { title: "患者サマリー（例）", description: "このページは、将来ClinIAが患者と共有したり診療記録に追加したりするサマリーを事前入力する方法を示しています。表示されているデータはすべて模擬データです。" },
    zh: { title: "患者摘要（示例）", description: "本页展示了ClinIA未来如何预先填写摘要，以便与患者分享或纳入病历。所有显示的数据均为模拟数据。" },
    he: { title: "סיכום למטופל (דוגמה)", description: "עמוד זה מדגים כיצד ClinIA תוכל בעתיד למלא מראש סיכום לשיתוף עם המטופל או להוספה לתיק הרפואי. כל הנתונים המוצגים הם נתוני הדמיה." },
};

export function getPatientSummaryHeader(locale: string) {
    return patientSummaryHeaders[locale.toLowerCase().split("-")[0]] ?? patientSummaryHeaders.en;
}

// Fixed English version of the French example. Never dynamically translated.
export const PATIENT_SUMMARY_EXAMPLE_EN: Record<keyof typeof UI_LABELS_FR.patientSummaryExample.panel, string> = {
    title: "Example patient content",
    summary: "Today, we discussed your high blood pressure. A treatment was proposed to help control it and reduce long-term risks to the heart, brain and kidneys.",
    medicationLabel: "Selected simulated medication:",
    medication: "Indapamide",
    instruction: "Take once a day, in the morning.",
    monitoring: "Watch for dizziness or unusual fatigue.",
    followUp: "Return for a consultation or contact the clinic if you experience concerning symptoms.",
    disclaimer: "In a real project, this type of text would be personalized and written with physicians' input, then reviewed from clinical, ethical and legal perspectives.",
};
