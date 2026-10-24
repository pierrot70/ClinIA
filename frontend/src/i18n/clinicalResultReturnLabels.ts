import { UI_LABELS_FR } from "./uiLabels.fr";
import { baseUiLocale } from "./uiLocales";

const translations: Record<string, { unavailable: string }> = {
    en: { unavailable: "The previous analysis is no longer available in this session. Return to the clinical form. No new analysis has been started." },
    es: { unavailable: "El análisis anterior ya no está disponible en esta sesión. Vuelva al formulario clínico. No se ha iniciado ningún análisis nuevo." },
    ko: { unavailable: "이 세션에서 이전 분석을 더 이상 사용할 수 없습니다. 임상 양식으로 돌아가세요. 새 분석은 시작되지 않았습니다." },
    vi: { unavailable: "Phân tích trước không còn khả dụng trong phiên này. Hãy quay lại biểu mẫu lâm sàng. Chưa có phân tích mới nào được bắt đầu." },
    no: { unavailable: "Den forrige analysen er ikke lenger tilgjengelig i denne økten. Gå tilbake til det kliniske skjemaet. Ingen ny analyse er startet." },
    ja: { unavailable: "このセッションでは以前の分析を利用できません。臨床フォームに戻ってください。新しい分析は開始されていません。" },
    zh: { unavailable: "本次会话中已无法查看先前的分析。请返回临床表单。未启动新的分析。" },
    he: { unavailable: "הניתוח הקודם אינו זמין עוד בהפעלה זו. יש לחזור לטופס הקליני. לא הופעל ניתוח חדש." },
};
export function clinicalResultReturnLabels(locale: string) {
    return translations[baseUiLocale(locale)] ?? UI_LABELS_FR.clinicalResultReturn;
}
