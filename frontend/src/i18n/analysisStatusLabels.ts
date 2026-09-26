import { UI_LABELS_FR } from "./uiLabels.fr";

type Labels = { [K in keyof typeof UI_LABELS_FR.analysisStatus]: string };
export const analysisStatusTranslations: Record<string, Labels> = {
    fr: UI_LABELS_FR.analysisStatus,
    en: { analyze: "Analyze", inProgress: "Clinical analysis in progress…" },
    es: { analyze: "Analizar", inProgress: "Análisis clínico en curso…" },
    ko: { analyze: "분석", inProgress: "임상 분석 중…" },
    vi: { analyze: "Phân tích", inProgress: "Đang phân tích lâm sàng…" },
    no: { analyze: "Analyser", inProgress: "Klinisk analyse pågår…" },
    ja: { analyze: "分析", inProgress: "臨床分析中…" },
    zh: { analyze: "分析", inProgress: "正在进行临床分析…" },
    he: { analyze: "ניתוח", inProgress: "ניתוח קליני מתבצע…" },
};
export const analysisStatusLabels = (locale: string): Labels =>
    analysisStatusTranslations[locale.toLowerCase().split("-")[0]] || analysisStatusTranslations.en;
