import { UI_LABELS_FR } from "./uiLabels.fr";

// Static English version of the simulated clinical content; no dynamic translation.
export const QUICK_MODE_PANEL_EN: Record<keyof typeof UI_LABELS_FR.quickModePanel, string> = {
    title: "Simulated recommendation",
    first: "first-line agent, very good blood pressure control, favorable tolerability profile.",
    second: "a relevant alternative, useful in patients with cardiac comorbidities.",
    third: "particularly relevant in cases of diabetes or nephropathy (simulation).",
    disclaimer: "Example of an ultra-condensed format that ClinIA could generate from validated data. All information shown here is fictional.",
};

export const quickModeHeaders: Record<string, Record<keyof typeof UI_LABELS_FR.quickModeHeader, string>> = {
    fr: UI_LABELS_FR.quickModeHeader,
    en: { title: "Quick mode (demo)", description: 'Example of a "6-second" presentation: 1 recommended treatment, 2 alternatives and 3 sentences covering the essentials. Fictional content.' },
    es: { title: "Modo rápido (demo)", description: 'Ejemplo de presentación de "6 segundos": 1 tratamiento recomendado, 2 alternativas y 3 frases con lo esencial. Contenido ficticio.' },
    ko: { title: "빠른 모드 (데모)", description: '"6초" 요약 예시: 권장 치료 1개, 대안 2개, 핵심을 담은 문장 3개. 가상의 내용입니다.' },
    vi: { title: "Chế độ nhanh (demo)", description: 'Ví dụ trình bày trong "6 giây": 1 phương pháp điều trị được đề xuất, 2 lựa chọn thay thế và 3 câu tóm tắt nội dung chính. Nội dung hư cấu.' },
    no: { title: "Hurtigmodus (demo)", description: 'Eksempel på en «6-sekunders» presentasjon: 1 anbefalt behandling, 2 alternativer og 3 setninger med det vesentlige. Fiktivt innhold.' },
    ja: { title: "クイックモード（デモ）", description: '「6秒」プレゼンテーションの例：推奨される治療1つ、代替案2つ、要点をまとめた3文。架空の内容です。' },
    zh: { title: "快速模式（演示）", description: '“6秒”展示示例：1种推荐治疗、2种替代方案，以及概括要点的3句话。内容为虚构。' },
    he: { title: "מצב מהיר (הדגמה)", description: 'דוגמה להצגה של "6 שניות": טיפול מומלץ אחד, שתי חלופות ושלושה משפטים המסכמים את העיקר. תוכן בדיוני.' },
};

export function getQuickModeHeader(locale: string) {
    return quickModeHeaders[locale.toLowerCase().split("-")[0]] ?? quickModeHeaders.en;
}
