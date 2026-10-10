import { UI_LABELS_FR } from "./uiLabels.fr";
import { baseUiLocale } from "./uiLocales";

export const MISC_UI_SOURCES_FR = {
    unusualActivity: UI_LABELS_FR.auth.passwordResetRequired.detected,
    restrictedAccess: UI_LABELS_FR.patientsPage.validation.restrictedAccess,
    availabilityAlignment: UI_LABELS_FR.specialistsPage.validation.invalidAvailabilityAlignment,
    openAiLogsDescription: UI_LABELS_FR.openAiLogs.description,
    clinic: UI_LABELS_FR.appointmentsList.table.clinic,
    processing: UI_LABELS_FR.loginPage.recovery.processing,
} as const;

export const MISC_UI_TRANSLATIONS: Record<string, Record<keyof typeof MISC_UI_SOURCES_FR, string>> = {
    en: {
        clinic: "Clinic",
        processing: "Processing...",
        unusualActivity: "Unusual activity has been detected on this account.",
        restrictedAccess: "Access temporarily restricted: ClinIA blocked this sensitive area after unusual activity was detected on this account. Try again later or contact a SUPERADMIN.",
        availabilityAlignment: "Availability times must align with 15-minute intervals.",
        openAiLogsDescription: "View anonymized requests sent to OpenAI, with filters preserved in the URL and CSV export using the same criteria.",
    },
    es: {
        clinic: "Clínica",
        processing: "Procesando...",
        unusualActivity: "Se ha detectado actividad inusual en esta cuenta.",
        restrictedAccess: "Acceso temporalmente restringido: ClinIA ha bloqueado esta área sensible tras detectar actividad inusual en esta cuenta. Inténtelo más tarde o contacte con un SUPERADMIN.",
        availabilityAlignment: "Las horas de disponibilidad deben ajustarse a intervalos de 15 minutos.",
        openAiLogsDescription: "Consulte las solicitudes anonimizadas enviadas a OpenAI, con filtros persistentes en la URL y exportación CSV basada en los mismos criterios.",
    },
    ko: {
        clinic: "클리닉",
        processing: "처리 중...",
        unusualActivity: "이 계정에서 비정상적인 활동이 감지되었습니다.",
        restrictedAccess: "접근이 일시적으로 제한되었습니다. 이 계정에서 비정상적인 활동이 감지되어 ClinIA가 이 민감한 영역을 차단했습니다. 나중에 다시 시도하거나 SUPERADMIN에게 문의하세요.",
        availabilityAlignment: "가능 시간은 15분 간격에 맞춰야 합니다.",
        openAiLogsDescription: "OpenAI로 전송된 익명화 요청을 확인하세요. 필터는 URL에 유지되며 CSV 내보내기는 같은 기준을 사용합니다.",
    },
    vi: {
        clinic: "Phòng khám",
        processing: "Đang xử lý...",
        unusualActivity: "Đã phát hiện hoạt động bất thường trên tài khoản này.",
        restrictedAccess: "Quyền truy cập tạm thời bị hạn chế: ClinIA đã chặn khu vực nhạy cảm này sau khi phát hiện hoạt động bất thường trên tài khoản. Hãy thử lại sau hoặc liên hệ SUPERADMIN.",
        availabilityAlignment: "Thời gian sẵn có phải theo các khoảng 15 phút.",
        openAiLogsDescription: "Xem các yêu cầu đã ẩn danh gửi đến OpenAI, với bộ lọc được lưu trong URL và xuất CSV theo cùng tiêu chí.",
    },
    no: {
        clinic: "Klinikk",
        processing: "Behandler...",
        unusualActivity: "Uvanlig aktivitet er oppdaget på denne kontoen.",
        restrictedAccess: "Tilgangen er midlertidig begrenset: ClinIA blokkerte dette sensitive området etter at uvanlig aktivitet ble oppdaget på kontoen. Prøv igjen senere eller kontakt en SUPERADMIN.",
        availabilityAlignment: "Tilgjengelige tidspunkter må følge intervaller på 15 minutter.",
        openAiLogsDescription: "Se anonymiserte forespørsler sendt til OpenAI, med filtre bevart i URL-en og CSV-eksport basert på de samme kriteriene.",
    },
    ja: {
        clinic: "クリニック",
        processing: "処理中...",
        unusualActivity: "このアカウントで通常と異なる活動が検出されました。",
        restrictedAccess: "アクセスは一時的に制限されています。このアカウントで通常と異なる活動が検出されたため、ClinIAはこの機密性の高い領域をブロックしました。後でもう一度試すか、SUPERADMINに連絡してください。",
        availabilityAlignment: "対応可能時刻は15分刻みにしてください。",
        openAiLogsDescription: "OpenAIに送信された匿名化済みリクエストを確認します。フィルターはURLに保持され、CSVエクスポートにも同じ条件が適用されます。",
    },
    zh: {
        clinic: "诊所",
        processing: "正在处理...",
        unusualActivity: "此账户检测到异常活动。",
        restrictedAccess: "访问暂时受限：ClinIA在此账户检测到异常活动后封锁了该敏感区域。请稍后重试或联系SUPERADMIN。",
        availabilityAlignment: "可用时段必须按15分钟间隔设置。",
        openAiLogsDescription: "查看发送至OpenAI的匿名化请求，筛选条件保留在URL中，CSV导出使用相同条件。",
    },
    he: {
        clinic: "מרפאה",
        processing: "מעבד...",
        unusualActivity: "זוהתה פעילות חריגה בחשבון זה.",
        restrictedAccess: "הגישה מוגבלת זמנית: ClinIA חסמה אזור רגיש זה לאחר שזוהתה פעילות חריגה בחשבון. נסו שוב מאוחר יותר או פנו ל־SUPERADMIN.",
        availabilityAlignment: "זמני הזמינות חייבים להיות במרווחים של 15 דקות.",
        openAiLogsDescription: "צפו בבקשות שעברו אנונימיזציה ונשלחו ל־OpenAI, עם מסננים הנשמרים בכתובת ה־URL וייצוא CSV לפי אותם קריטריונים.",
    },
};

const sourceKeys = new Map<string, keyof typeof MISC_UI_SOURCES_FR>(
    Object.entries(MISC_UI_SOURCES_FR).map(([key, source]) => [source, key as keyof typeof MISC_UI_SOURCES_FR]));
export function localizeMiscUiLabel(source: string, locale: string): string | null {
    const key = sourceKeys.get(source);
    if (!key) return null;
    const language = baseUiLocale(locale);
    return language === "fr" ? MISC_UI_SOURCES_FR[key] : MISC_UI_TRANSLATIONS[language]?.[key] ?? null;
}
