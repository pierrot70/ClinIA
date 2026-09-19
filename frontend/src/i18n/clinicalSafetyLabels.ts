import { UI_LABELS_FR } from "./uiLabels.fr";

type Labels = { [K in keyof typeof UI_LABELS_FR.clinicalSafety]: string };

// UI headings are localized. Medical response content is preserved verbatim.
export const clinicalSafetyTranslations: Record<string, Labels> = {
    fr: UI_LABELS_FR.clinicalSafety,
    en: { alternatives: "Therapeutic alternatives", redFlags: "Red flags" },
    es: { alternatives: "Alternativas terapéuticas", redFlags: "Señales de alerta" },
    ja: { alternatives: "代替治療の選択肢", redFlags: "警告徴候" },
    zh: { alternatives: "替代治疗方案", redFlags: "警示征象" },
    he: { alternatives: "חלופות טיפוליות", redFlags: "סימני אזהרה" },
    ko: { alternatives: "대체 치료 선택지", redFlags: "위험 신호" },
    vi: { alternatives: "Các lựa chọn điều trị thay thế", redFlags: "Dấu hiệu cảnh báo" },
    no: { alternatives: "Behandlingsalternativer", redFlags: "Varseltegn" },
};

export const clinicalSafetyLabels = (locale: string): Labels =>
    clinicalSafetyTranslations[locale.toLowerCase().split("-")[0]] || clinicalSafetyTranslations.en;
