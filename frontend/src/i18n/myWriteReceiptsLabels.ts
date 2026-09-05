import { UI_LABELS_FR } from "./uiLabels.fr";

const s = UI_LABELS_FR.myWriteReceipts;
export const receiptLocales = ["en", "es", "ko", "vi", "no", "ja", "zh", "he"] as const;
// Each row starts with the versioned French source, followed by the eight locales above.
type TranslationRow = readonly [string, string, string, string, string, string, string, string, string];
export const receiptLabelRows: TranslationRow[] = [
    [s.operations.CREATE, "Creation", "Creación", "생성", "Tạo mới", "Opprettelse", "作成", "创建", "יצירה"],
    [s.operations.UPDATE, "Update", "Modificación", "수정", "Cập nhật", "Endring", "更新", "修改", "עדכון"],
    [s.operations.DELETE, "Deletion", "Eliminación", "삭제", "Xóa", "Sletting", "削除", "删除", "מחיקה"],
    [s.operations.REPLY, "Reply", "Respuesta", "답변", "Trả lời", "Svar", "返信", "回复", "מענה"],
    [s.collections.patients, "Patients", "Pacientes", "환자", "Bệnh nhân", "Pasienter", "患者", "患者", "מטופלים"],
    [s.collections.appointments, "Appointments", "Citas", "예약", "Lịch hẹn", "Avtaler", "予約", "预约", "תורים"],
    [s.collections.diagnosisresults, "Analysis results", "Resultados del análisis", "분석 결과", "Kết quả phân tích", "Analyseresultater", "分析結果", "分析结果", "תוצאות הניתוח"],
    [s.collections.cliniciancomments, "Doctor comments", "Comentarios de médicos", "의사 의견", "Ý kiến của bác sĩ", "Kommentarer fra leger", "医師からのコメント", "医生留言", "תגובות רופאים"],
    [s.title, "My write receipts", "Mis comprobantes de escritura", "내 저장 영수증", "Biên nhận ghi dữ liệu của tôi", "Mine lagringskvitteringer", "自分の書き込み受領書", "我的写入回执", "אישורי הכתיבה שלי"],
    [s.description, "Find confirmations of your own clinical writes. Other users’ receipts are never displayed.", "Consulte las confirmaciones de sus propias escrituras clínicas. Nunca se muestran comprobantes de otros usuarios.", "본인이 저장한 임상 데이터의 확인 내역을 조회합니다. 다른 사용자의 영수증은 표시되지 않습니다.", "Xem xác nhận các lần ghi dữ liệu lâm sàng của bạn. Biên nhận của người dùng khác không bao giờ được hiển thị.", "Finn bekreftelser på dine egne kliniske lagringer. Andre brukeres kvitteringer vises aldri.", "自分が行った臨床データの書き込み確認を表示します。他のユーザーの受領書は表示されません。", "查看您自己的临床数据写入确认。绝不显示其他用户的回执。", "כאן מוצגים אישורי הכתיבה הקלינית שלך בלבד. אישורים של משתמשים אחרים אינם מוצגים."],
    [s.filters.patient, "Patient", "Paciente", "환자", "Bệnh nhân", "Pasient", "患者", "患者", "מטופל"],
    [s.filters.patientSearch, "Search for a patient", "Buscar un paciente", "환자 검색", "Tìm bệnh nhân", "Søk etter pasient", "患者を検索", "搜索患者", "חיפוש מטופל"],
    [s.filters.collection, "Collection", "Colección", "컬렉션", "Bộ sưu tập", "Samling", "コレクション", "集合", "אוסף"],
    [s.filters.operation, "Operation", "Operación", "작업", "Thao tác", "Operasjon", "操作", "操作", "פעולה"],
    [s.filters.startDate, "Start date", "Fecha de inicio", "시작일", "Ngày bắt đầu", "Startdato", "開始日", "开始日期", "תאריך התחלה"],
    [s.filters.endDate, "End date", "Fecha de fin", "종료일", "Ngày kết thúc", "Sluttdato", "終了日", "结束日期", "תאריך סיום"],
    [s.filters.allPatients, "All my patients", "Todos mis pacientes", "내 모든 환자", "Tất cả bệnh nhân của tôi", "Alle mine pasienter", "自分のすべての患者", "我的所有患者", "כל המטופלים שלי"],
    [s.filters.allCollections, "All collections", "Todas las colecciones", "모든 컬렉션", "Tất cả bộ sưu tập", "Alle samlinger", "すべてのコレクション", "所有集合", "כל האוספים"],
    [s.filters.allOperations, "All operations", "Todas las operaciones", "모든 작업", "Tất cả thao tác", "Alle operasjoner", "すべての操作", "所有操作", "כל הפעולות"],
    [s.placeholders.patientSearch, "Last or first name", "Apellido o nombre", "성 또는 이름", "Họ hoặc tên", "Etternavn eller fornavn", "姓または名", "姓或名", "שם משפחה או שם פרטי"],
    [s.actions.search, "Search", "Buscar", "검색", "Tìm kiếm", "Søk", "検索", "搜索", "חיפוש"],
    [s.actions.reset, "Reset", "Restablecer", "초기화", "Đặt lại", "Nullstill", "リセット", "重置", "איפוס"],
    [s.actions.copy, "Copy", "Copiar", "복사", "Sao chép", "Kopier", "コピー", "复制", "העתקה"],
    [s.actions.copied, "Copied", "Copiado", "복사됨", "Đã sao chép", "Kopiert", "コピー済み", "已复制", "הועתק"],
    [s.actions.previous, "Previous", "Anterior", "이전", "Trước", "Forrige", "前へ", "上一页", "הקודם"],
    [s.actions.next, "Next", "Siguiente", "다음", "Tiếp", "Neste", "次へ", "下一页", "הבא"],
    [s.actions.showDetails, "View receipt", "Ver comprobante", "영수증 보기", "Xem biên nhận", "Vis kvittering", "受領書を表示", "查看回执", "הצגת האישור"],
    [s.actions.hideDetails, "Hide receipt", "Ocultar comprobante", "영수증 숨기기", "Ẩn biên nhận", "Skjul kvittering", "受領書を非表示", "隐藏回执", "הסתרת האישור"],
    [s.actions.clearPatient, "Clear patient", "Quitar paciente", "환자 선택 해제", "Bỏ chọn bệnh nhân", "Fjern pasientvalg", "患者の選択を解除", "清除患者选择", "ניקוי בחירת המטופל"],
    [s.status.loading, "Loading receipts...", "Cargando comprobantes...", "영수증을 불러오는 중...", "Đang tải biên nhận...", "Laster kvitteringer...", "受領書を読み込み中...", "正在加载回执...", "טעינת אישורים..."],
    [s.status.empty, "No receipts match these criteria.", "Ningún comprobante coincide con estos criterios.", "조건에 맞는 영수증이 없습니다.", "Không có biên nhận phù hợp với tiêu chí này.", "Ingen kvitteringer samsvarer med kriteriene.", "条件に一致する受領書はありません。", "没有符合条件的回执。", "אין אישורים התואמים לתנאים אלה."],
    [s.status.results, "receipt(s) found", "comprobante(s) encontrado(s)", "건의 영수증 검색됨", "biên nhận được tìm thấy", "kvitteringer funnet", "件の受領書が見つかりました", "条回执", "אישורים נמצאו"],
    [s.status.patientsLoading, "Searching for patients...", "Buscando pacientes...", "환자 검색 중...", "Đang tìm bệnh nhân...", "Søker etter pasienter...", "患者を検索中...", "正在搜索患者...", "חיפוש מטופלים..."],
    [s.status.patientSearchHint, "Enter at least 2 characters to search for a patient.", "Escriba al menos 2 caracteres para buscar un paciente.", "환자를 검색하려면 2자 이상 입력하세요.", "Nhập ít nhất 2 ký tự để tìm bệnh nhân.", "Skriv minst 2 tegn for å søke etter en pasient.", "患者を検索するには2文字以上入力してください。", "请输入至少2个字符以搜索患者。", "יש להזין לפחות 2 תווים לחיפוש מטופל."],
    [s.status.patientSearchEmpty, "No patients match this search.", "Ningún paciente coincide con esta búsqueda.", "검색에 일치하는 환자가 없습니다.", "Không có bệnh nhân phù hợp với tìm kiếm này.", "Ingen pasienter samsvarer med søket.", "検索に一致する患者はいません。", "没有符合搜索条件的患者。", "לא נמצאו מטופלים התואמים לחיפוש."],
    [s.status.copyError, "Unable to copy the receipt.", "No se pudo copiar el comprobante.", "영수증을 복사할 수 없습니다.", "Không thể sao chép biên nhận.", "Kunne ikke kopiere kvitteringen.", "受領書をコピーできません。", "无法复制回执。", "לא ניתן להעתיק את האישור."],
    [s.status.loadError, "Unable to load receipts. Please try again.", "No se pudieron cargar los comprobantes. Inténtelo de nuevo.", "영수증을 불러올 수 없습니다. 다시 시도하세요.", "Không thể tải biên nhận. Vui lòng thử lại.", "Kunne ikke laste kvitteringer. Prøv igjen.", "受領書を読み込めません。もう一度お試しください。", "无法加载回执。请重试。", "לא ניתן לטעון את האישורים. יש לנסות שוב."],
    [s.table.date, "Date", "Fecha", "날짜", "Ngày", "Dato", "日付", "日期", "תאריך"],
    [s.table.verification, "Verification ID", "ID de verificación", "확인 ID", "Mã xác minh", "Bekreftelses-ID", "確認ID", "验证ID", "מזהה אימות"],
    [s.table.fields, "Changed fields", "Campos modificados", "변경된 필드", "Trường đã thay đổi", "Endrede felt", "変更された項目", "已修改字段", "שדות ששונו"],
    [s.table.replica, "Replica", "Réplica", "복제본", "Bản sao", "Replika", "レプリカ", "副本", "עותק משוכפל"],
    [s.table.details, "Details", "Detalles", "상세 정보", "Chi tiết", "Detaljer", "詳細", "详情", "פרטים"],
    [s.details.title, "Write receipt details", "Detalles del comprobante de escritura", "저장 영수증 상세", "Chi tiết biên nhận ghi dữ liệu", "Detaljer om lagringskvittering", "書き込み受領書の詳細", "写入回执详情", "פרטי אישור הכתיבה"],
    [s.details.date, "Saved on", "Fecha de guardado", "저장 일시", "Thời điểm lưu", "Lagret", "保存日時", "保存时间", "מועד השמירה"],
    [s.details.persistence, "Persistence confirmation", "Confirmación de persistencia", "영구 저장 확인", "Xác nhận lưu bền vững", "Bekreftelse på varig lagring", "永続化の確認", "持久化确认", "אישור שמירה מתמשכת"],
    [s.details.majority, "Mongo majority", "Mayoría de Mongo", "Mongo 과반수", "Đa số Mongo", "Mongo-flertall", "Mongo過半数", "Mongo多数节点", "רוב Mongo"],
    [s.details.replica, "Replica status", "Estado de la réplica", "복제본 상태", "Trạng thái bản sao", "Replikastatus", "レプリカの状態", "副本状态", "מצב העותק המשוכפל"],
    [s.details.lag, "Maximum lag", "Retraso máximo", "최대 지연", "Độ trễ tối đa", "Maksimal forsinkelse", "最大遅延", "最大延迟", "השהיה מרבית"],
    [s.details.writeConcern, "Write concern", "Garantía de escritura", "쓰기 확인 수준", "Mức xác nhận ghi", "Skrivebekreftelse", "書き込み確認レベル", "写入确认级别", "רמת אישור כתיבה"],
    [s.details.resource, "Resource ID", "ID del recurso", "리소스 ID", "Mã tài nguyên", "Ressurs-ID", "リソースID", "资源ID", "מזהה משאב"],
    [s.details.available, "Available", "Disponible", "사용 가능", "Khả dụng", "Tilgjengelig", "利用可能", "可用", "זמין"],
    [s.details.unavailable, "Unavailable", "No disponible", "사용 불가", "Không khả dụng", "Utilgjengelig", "利用不可", "不可用", "לא זמין"],
    [s.details.confirmed, "Confirmed", "Confirmado", "확인됨", "Đã xác nhận", "Bekreftet", "確認済み", "已确认", "מאושר"],
    [s.unavailablePatient, "Patient unavailable", "Paciente no disponible", "환자 정보 없음", "Không có thông tin bệnh nhân", "Pasient utilgjengelig", "患者情報を利用できません", "患者信息不可用", "המטופל אינו זמין"],
    [s.noPatient, "No linked patient", "Sin paciente asociado", "연결된 환자 없음", "Không có bệnh nhân liên kết", "Ingen tilknyttet pasient", "関連する患者なし", "无关联患者", "ללא מטופל משויך"],
    [s.healthy, "healthy", "en buen estado", "정상", "hoạt động tốt", "friske", "正常", "正常", "תקינים"],
    [UI_LABELS_FR.header.nav.myWriteReceipts, "My receipts", "Mis comprobantes", "내 영수증", "Biên nhận của tôi", "Mine kvitteringer", "自分の受領書", "我的回执", "האישורים שלי"],
];

export function getReceiptLabelFallback(text: string, locale: string): string | null {
    const base = locale.toLowerCase().split("-")[0];
    const row = receiptLabelRows.find(row => row[0] === text);
    if (!row) return null;
    if (base === "fr") return text;
    const index = receiptLocales.indexOf(base as typeof receiptLocales[number]);
    return index < 0 ? null : row[index + 1];
}

type Localized<T> = { [K in keyof T]: T[K] extends string ? string : Localized<T[K]> };
export function getMyWriteReceiptsLabels(locale: string): Localized<typeof s> {
    const translate = (value: string | object): unknown => typeof value === "string"
        ? getReceiptLabelFallback(value, locale) ?? value
        : Object.fromEntries(Object.entries(value).map(([key, child]) => [key, translate(child)]));
    return translate(s) as Localized<typeof s>;
}
