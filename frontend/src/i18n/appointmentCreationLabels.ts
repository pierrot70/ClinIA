import { UI_LABELS_FR } from "./uiLabels.fr";

const s = UI_LABELS_FR.appointmentsPage;
export const appointmentCreationLocales = ["en", "es", "ko", "vi", "no", "ja", "zh", "he"] as const;
// French source followed by EN, ES, KO, VI, NO, JA, ZH, HE. UI labels only.
type Row = readonly [string, string, string, string, string, string, string, string, string];
export const appointmentCreationRows: Row[] = [
    [s.specialist.referenceClinicChoose, "Choose your practice clinic *", "Seleccione su clínica de práctica *", "진료 클리닉을 선택하세요 *", "Chọn phòng khám nơi bạn hành nghề *", "Velg din praksisklinikk *", "診療施設を選択してください *", "选择您的执业诊所 *", "יש לבחור את מרפאת העבודה שלך *"],
    [s.title, "Create an appointment", "Crear una cita", "예약 생성", "Tạo lịch hẹn", "Opprett en avtale", "予約を作成", "创建预约", "יצירת תור"],
    [s.tabs.create, "Creation", "Creación", "생성", "Tạo mới", "Opprettelse", "作成", "创建", "יצירה"],
    [s.tabs.list, "View list", "Ver lista", "목록 보기", "Xem danh sách", "Vis liste", "一覧を表示", "查看列表", "הצגת הרשימה"],
    [s.patientSearch.insurancePlaceholder, "Health insurance number (auto)", "Número de seguro médico (automático)", "건강보험 번호 (자동)", "Số bảo hiểm y tế (tự động)", "Helseforsikringsnummer (automatisk)", "健康保険番号（自動）", "医疗保险号码（自动）", "מספר ביטוח בריאות (אוטומטי)"],
    [s.patientSearch.title, "Search for an existing patient", "Buscar un paciente existente", "기존 환자 검색", "Tìm bệnh nhân hiện có", "Søk etter en eksisterende pasient", "既存の患者を検索", "搜索现有患者", "חיפוש מטופל קיים"],
    [s.specialist.referenceClinicLabel, "Referring physician's practice clinic *", "Clínica de práctica del médico remitente *", "의뢰 의사의 진료 클리닉 *", "Phòng khám của bác sĩ giới thiệu *", "Henvisende leges praksisklinikk *", "紹介元医師の診療施設 *", "转诊医生的执业诊所 *", "מרפאת הרופא המפנה *"],
    [s.specialist.selectPatient, "First select a patient from the results", "Primero seleccione un paciente de los resultados", "먼저 검색 결과에서 환자를 선택하세요", "Trước tiên hãy chọn bệnh nhân từ kết quả", "Velg først en pasient fra resultatene", "最初に検索結果から患者を選択してください", "请先从结果中选择患者", "תחילה יש לבחור מטופל מתוך התוצאות"],
    [s.slots.label, "Available time slots", "Horarios disponibles", "예약 가능한 시간", "Khung giờ còn trống", "Ledige tidspunkter", "予約可能な時間帯", "可用时段", "שעות פנויות"],
    [s.reasonPlaceholder, "Reason (optional)", "Motivo (opcional)", "사유 (선택 사항)", "Lý do (không bắt buộc)", "Årsak (valgfritt)", "理由（任意）", "原因（可选）", "סיבה (לא חובה)"],
    [s.action.submit, "Create appointment", "Crear cita", "예약 생성", "Tạo lịch hẹn", "Opprett avtale", "予約を作成", "创建预约", "יצירת תור"],
];

export function getAppointmentCreationFallback(text: string, locale: string): string | null {
    const row = appointmentCreationRows.find(row => row[0] === text);
    if (!row) return null;
    const base = locale.toLowerCase().split("-")[0];
    if (base === "fr") return text;
    const index = appointmentCreationLocales.indexOf(base as typeof appointmentCreationLocales[number]);
    return index < 0 ? null : row[index + 1];
}
