import { UI_LABELS_FR } from "./uiLabels.fr";
import { baseUiLocale } from "./uiLocales";

type Copy = Record<keyof typeof UI_LABELS_FR.securityBlocking, string>;
const translations: Record<string, Copy> = {
    en: {
        identifyingContent: "The detected content contains patient identifiers. Please explicitly confirm 'I have read and understood' to continue.",
        loggingRequired: "The security incident must be logged before continuing.",
        missingIncident: "The security incident is missing. Restart the analysis to continue.",
        acknowledgmentFailed: "Unable to record the security confirmation. Try again or contact the administrator.",
        acknowledgedRestart: "Confirmation recorded. Restart the analysis to continue.",
        acknowledgedReplay: "Confirmation recorded. Analysis restarted with the same content.",
        correctedReplay: "Analysis restarted with the corrected parameters.",
    },
    es: {
        identifyingContent: "El contenido detectado contiene identificadores de pacientes. Confirme explícitamente 'He leído y comprendido' para continuar.",
        loggingRequired: "El incidente de seguridad debe registrarse antes de continuar.",
        missingIncident: "Falta el incidente de seguridad. Reinicie el análisis para continuar.",
        acknowledgmentFailed: "No se pudo registrar la confirmación de seguridad. Inténtelo de nuevo o contacte con el administrador.",
        acknowledgedRestart: "Confirmación registrada. Reinicie el análisis para continuar.",
        acknowledgedReplay: "Confirmación registrada. Se reinició el análisis con el mismo contenido.",
        correctedReplay: "Se reinició el análisis con los parámetros corregidos.",
    },
    ko: {
        identifyingContent: "감지된 내용에 환자 식별 정보가 포함되어 있습니다. 계속하려면 '읽고 이해했습니다'를 명시적으로 확인하세요.",
        loggingRequired: "계속하기 전에 보안 사고를 기록해야 합니다.",
        missingIncident: "보안 사고 정보가 없습니다. 계속하려면 분석을 다시 시작하세요.",
        acknowledgmentFailed: "보안 확인을 기록할 수 없습니다. 다시 시도하거나 관리자에게 문의하세요.",
        acknowledgedRestart: "확인이 기록되었습니다. 계속하려면 분석을 다시 시작하세요.",
        acknowledgedReplay: "확인이 기록되었습니다. 동일한 내용으로 분석을 다시 시작했습니다.",
        correctedReplay: "수정된 매개변수로 분석을 다시 시작했습니다.",
    },
    vi: {
        identifyingContent: "Nội dung phát hiện có chứa thông tin nhận dạng bệnh nhân. Vui lòng xác nhận rõ ràng 'Tôi đã đọc và hiểu' để tiếp tục.",
        loggingRequired: "Sự cố bảo mật phải được ghi lại trước khi tiếp tục.",
        missingIncident: "Thiếu thông tin sự cố bảo mật. Hãy khởi động lại phân tích để tiếp tục.",
        acknowledgmentFailed: "Không thể ghi lại xác nhận bảo mật. Hãy thử lại hoặc liên hệ quản trị viên.",
        acknowledgedRestart: "Đã ghi lại xác nhận. Hãy khởi động lại phân tích để tiếp tục.",
        acknowledgedReplay: "Đã ghi lại xác nhận. Phân tích đã được khởi động lại với cùng nội dung.",
        correctedReplay: "Phân tích đã được khởi động lại với các tham số đã sửa.",
    },
    no: {
        identifyingContent: "Det oppdagede innholdet inneholder pasientidentifikatorer. Bekreft uttrykkelig 'Jeg har lest og forstått' for å fortsette.",
        loggingRequired: "Sikkerhetshendelsen må loggføres før du fortsetter.",
        missingIncident: "Sikkerhetshendelsen mangler. Start analysen på nytt for å fortsette.",
        acknowledgmentFailed: "Kunne ikke registrere sikkerhetsbekreftelsen. Prøv igjen eller kontakt administratoren.",
        acknowledgedRestart: "Bekreftelse registrert. Start analysen på nytt for å fortsette.",
        acknowledgedReplay: "Bekreftelse registrert. Analysen er startet på nytt med samme innhold.",
        correctedReplay: "Analysen er startet på nytt med de korrigerte parameterne.",
    },
    ja: {
        identifyingContent: "検出された内容に患者を識別する情報が含まれています。続行するには『読み、理解しました』を明示的に確認してください。",
        loggingRequired: "続行する前にセキュリティインシデントを記録する必要があります。",
        missingIncident: "セキュリティインシデントが見つかりません。続行するには分析を再開してください。",
        acknowledgmentFailed: "セキュリティ確認を記録できません。再試行するか管理者に連絡してください。",
        acknowledgedRestart: "確認を記録しました。続行するには分析を再開してください。",
        acknowledgedReplay: "確認を記録しました。同じ内容で分析を再開しました。",
        correctedReplay: "修正したパラメーターで分析を再開しました。",
    },
    zh: {
        identifyingContent: "检测到的内容包含患者身份信息。请明确确认『我已阅读并理解』以继续。",
        loggingRequired: "继续之前必须记录安全事件。",
        missingIncident: "缺少安全事件信息。请重新开始分析以继续。",
        acknowledgmentFailed: "无法记录安全确认。请重试或联系管理员。",
        acknowledgedRestart: "已记录确认。请重新开始分析以继续。",
        acknowledgedReplay: "已记录确认。已使用相同内容重新开始分析。",
        correctedReplay: "已使用修正后的参数重新开始分析。",
    },
    he: {
        identifyingContent: "התוכן שזוהה מכיל מזהים של מטופלים. יש לאשר במפורש 'קראתי והבנתי' כדי להמשיך.",
        loggingRequired: "יש לתעד את אירוע האבטחה לפני שממשיכים.",
        missingIncident: "אירוע האבטחה חסר. יש להתחיל את הניתוח מחדש כדי להמשיך.",
        acknowledgmentFailed: "לא ניתן לתעד את אישור האבטחה. יש לנסות שוב או לפנות למנהל המערכת.",
        acknowledgedRestart: "האישור תועד. יש להתחיל את הניתוח מחדש כדי להמשיך.",
        acknowledgedReplay: "האישור תועד. הניתוח התחיל מחדש עם אותו תוכן.",
        correctedReplay: "הניתוח התחיל מחדש עם הפרמטרים המתוקנים.",
    },
};
const sourceKeys = new Map<string, keyof Copy>(Object.entries(UI_LABELS_FR.securityBlocking).map(([key, value]) => [value, key as keyof Copy]));
export function localizeSecurityUiLabel(source: string, locale: string): string | null {
    const key = sourceKeys.get(source);
    if (!key) return null;
    const language = baseUiLocale(locale);
    return language === "fr" ? UI_LABELS_FR.securityBlocking[key] : translations[language]?.[key] ?? null;
}
