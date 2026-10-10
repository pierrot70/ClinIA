import { UI_LABELS_FR } from "./uiLabels.fr";
import { baseUiLocale, validUiTranslation } from "./uiLocales";
import { adminUiRows } from "./adminUiLabels";
import compiled from "./compiledUiTranslations.json";

const languages = ["fr", "en", "es", "ko", "vi", "no", "ja", "zh", "he"];
export const clinicalUiGroups = ["clinicalNoteHistory", "patientClinicalNotes", "clinicalPatientSelection", "clinicalSupportAccessRequestPage", "delegatedPatientAccessPage", "coordinationRequestsPage", "writeOperationAudits"] as const;

function sourceAt(path: string): string {
    let value: unknown = UI_LABELS_FR;
    for (const key of path.split(".")) value = (value as Record<string, unknown>)[key];
    if (typeof value !== "string") throw new Error(`Invalid clinical UI key: ${path}`);
    return value;
}
function row(path: string, ...translations: string[]): readonly string[] {
    return [sourceAt(path), ...translations];
}

// Only versioned interface labels: clinical/user content is never translated here.
const explicitRows: readonly (readonly string[])[] = [
row("clinicalNoteHistory.open", "Note history", "Historial de notas", "노트 기록", "Lịch sử ghi chú", "Notathistorikk", "ノートの履歴", "记录历史", "היסטוריית הערות"),
row("clinicalNoteHistory.title", "Versioned clinical history", "Historial clínico versionado", "버전별 임상 기록", "Lịch sử lâm sàng theo phiên bản", "Versjonert klinisk historikk", "版管理された臨床履歴", "版本化临床历史", "היסטוריה קלינית עם גרסאות"),
row("clinicalNoteHistory.description", "Each version is kept separately. Restoring a version creates a new version and never deletes the history.", "Cada versión se conserva por separado. Restaurar una versión crea una nueva y nunca elimina el historial.", "각 버전은 별도로 보존됩니다. 버전을 복원하면 새 버전이 생성되며 기록은 삭제되지 않습니다.", "Mỗi phiên bản được lưu riêng. Khôi phục một phiên bản sẽ tạo phiên bản mới và không bao giờ xóa lịch sử.", "Hver versjon lagres separat. Gjenoppretting oppretter en ny versjon og sletter aldri historikken.", "各版は個別に保存されます。版を復元すると新しい版が作成され、履歴は削除されません。", "每个版本单独保存。恢复版本会创建新版本，绝不会删除历史。", "כל גרסה נשמרת בנפרד. שחזור גרסה יוצר גרסה חדשה ולעולם אינו מוחק את ההיסטוריה."),
row("clinicalNoteHistory.loading", "Loading history...", "Cargando historial...", "기록 불러오는 중...", "Đang tải lịch sử...", "Laster historikk...", "履歴を読み込み中...", "正在加载历史...", "טוען היסטוריה..."),
row("clinicalNoteHistory.empty", "No clinical versions are available yet.", "Aún no hay versiones clínicas disponibles.", "아직 사용 가능한 임상 버전이 없습니다.", "Chưa có phiên bản lâm sàng nào.", "Ingen kliniske versjoner er tilgjengelige ennå.", "利用可能な臨床記録の版はまだありません。", "尚无可用的临床版本。", "עדיין אין גרסאות קליניות זמינות."),
row("clinicalNoteHistory.restore", "Restore this version", "Restaurar esta versión", "이 버전 복원", "Khôi phục phiên bản này", "Gjenopprett denne versjonen", "この版を復元", "恢复此版本", "שחזור גרסה זו"),
row("clinicalNoteHistory.restoring", "Restoring...", "Restaurando...", "복원 중...", "Đang khôi phục...", "Gjenoppretter...", "復元中...", "正在恢复...", "משחזר..."),
row("clinicalNoteHistory.confirmRestore", "Restore this version as a new current note? The existing history will be preserved.", "¿Restaurar esta versión como nueva nota actual? Se conservará el historial existente.", "이 버전을 새 현재 노트로 복원하시겠습니까? 기존 기록은 보존됩니다.", "Khôi phục phiên bản này làm ghi chú hiện tại mới? Lịch sử hiện có sẽ được giữ lại.", "Gjenopprette denne versjonen som et nytt gjeldende notat? Historikken beholdes.", "この版を新しい現在のノートとして復元しますか？既存の履歴は保持されます。", "将此版本恢复为新的当前记录？现有历史将保留。", "לשחזר גרסה זו כהערה הנוכחית החדשה? ההיסטוריה הקיימת תישמר."),
row("clinicalNoteHistory.version", "Version", "Versión", "버전", "Phiên bản", "Versjon", "版", "版本", "גרסה"),
row("clinicalNoteHistory.baseline", "Baseline version", "Versión inicial", "기본 버전", "Phiên bản gốc", "Grunnversjon", "基準となる版", "基准版本", "גרסת בסיס"),
row("clinicalNoteHistory.update", "Update", "Actualización", "업데이트", "Cập nhật", "Oppdatering", "更新", "更新", "עדכון"),
row("clinicalNoteHistory.restoreType", "Restoration", "Restauración", "복원", "Khôi phục", "Gjenoppretting", "復元", "恢复", "שחזור"),
row("clinicalNoteHistory.savedAt", "Saved on", "Guardada el", "저장 일시", "Đã lưu vào", "Lagret", "保存日時", "保存时间", "נשמרה בתאריך"),
row("clinicalNoteHistory.author", "Author", "Autor", "작성자", "Tác giả", "Forfatter", "作成者", "作者", "מחבר"),
row("clinicalNoteHistory.current", "Current", "Actual", "현재", "Hiện tại", "Gjeldende", "現在", "当前", "נוכחית"),
row("clinicalNoteHistory.error", "Unable to load or restore clinical history.", "No se pudo cargar o restaurar el historial clínico.", "임상 기록을 불러오거나 복원할 수 없습니다.", "Không thể tải hoặc khôi phục lịch sử lâm sàng.", "Kan ikke laste eller gjenopprette klinisk historikk.", "臨床履歴を読み込むか復元することができません。", "无法加载或恢复临床历史。", "לא ניתן לטעון או לשחזר את ההיסטוריה הקלינית."),
row("patientClinicalNotes.open", "Clinical notes", "Notas clínicas", "임상 노트", "Ghi chú lâm sàng", "Kliniske notater", "臨床ノート", "临床记录", "הערות קליניות"),
row("patientClinicalNotes.title", "Patient clinical notes", "Notas clínicas del paciente", "환자 임상 노트", "Ghi chú lâm sàng của bệnh nhân", "Pasientens kliniske notater", "患者の臨床ノート", "患者临床记录", "הערות קליניות של המטופל"),
row("patientClinicalNotes.description", "The current note is versioned on every save. Version contents are restricted to the patient's authorized users.", "Se crea una versión de la nota actual cada vez que se guarda. El contenido de las versiones está reservado a los usuarios autorizados del paciente.", "저장할 때마다 현재 노트의 버전이 생성됩니다. 버전 내용은 해당 환자에 대한 권한이 있는 사용자만 볼 수 있습니다.", "Ghi chú hiện tại được tạo phiên bản mỗi lần lưu. Nội dung các phiên bản chỉ dành cho người dùng được phép truy cập bệnh nhân này.", "Det gjeldende notatet versjoneres ved hver lagring. Innholdet er forbeholdt brukere med tilgang til pasienten.", "保存するたびに現在のノートの版が作成されます。各版の内容は患者へのアクセス権があるユーザーだけが閲覧できます。", "每次保存都会为当前记录创建版本。版本内容仅限获准访问该患者的用户查看。", "ההערה הנוכחית מקבלת גרסה בכל שמירה. תוכן הגרסאות זמין רק למשתמשים המורשים לגשת למטופל."),
row("patientClinicalNotes.currentNote", "Current note", "Nota actual", "현재 노트", "Ghi chú hiện tại", "Gjeldende notat", "現在のノート", "当前记录", "הערה נוכחית"),
row("patientClinicalNotes.entryTimestampPrefix", "Entry dated", "Entrada del", "기록 날짜", "Mục ghi ngày", "Oppføring fra", "記載日", "记录日期", "רישום מתאריך"),
row("patientClinicalNotes.placeholder", "Enter the clinical note...", "Introduzca la nota clínica...", "임상 노트 입력...", "Nhập ghi chú lâm sàng...", "Skriv det kliniske notatet...", "臨床ノートを入力...", "输入临床记录...", "הזנת ההערה הקלינית..."),
row("patientClinicalNotes.save", "Save note", "Guardar nota", "노트 저장", "Lưu ghi chú", "Lagre notat", "ノートを保存", "保存记录", "שמירת ההערה"),
row("patientClinicalNotes.saving", "Saving...", "Guardando...", "저장 중...", "Đang lưu...", "Lagrer...", "保存中...", "正在保存...", "שומר..."),
row("patientClinicalNotes.discard", "Discard changes", "Descartar cambios", "변경 사항 취소", "Bỏ thay đổi", "Forkast endringer", "変更を破棄", "放弃更改", "ביטול השינויים"),
row("patientClinicalNotes.back", "Back", "Volver", "뒤로", "Quay lại", "Tilbake", "戻る", "返回", "חזרה"),
row("patientClinicalNotes.saved", "Clinical note saved.", "Nota clínica guardada.", "임상 노트가 저장되었습니다.", "Đã lưu ghi chú lâm sàng.", "Klinisk notat lagret.", "臨床ノートを保存しました。", "临床记录已保存。", "ההערה הקלינית נשמרה."),
row("patientClinicalNotes.error", "Unable to save the clinical note.", "No se pudo guardar la nota clínica.", "임상 노트를 저장할 수 없습니다.", "Không thể lưu ghi chú lâm sàng.", "Kan ikke lagre det kliniske notatet.", "臨床ノートを保存できません。", "无法保存临床记录。", "לא ניתן לשמור את ההערה הקלינית."),
row("patientClinicalNotes.help.button", "Help with this action", "Ayuda para esta acción", "이 작업에 대한 도움말", "Trợ giúp cho thao tác này", "Hjelp med denne handlingen", "この操作のヘルプ", "此操作的帮助", "עזרה לפעולה זו"),
row("patientClinicalNotes.help.back", "Return to the patient list without changing the note.", "Vuelva a la lista de pacientes sin modificar la nota.", "노트를 변경하지 않고 환자 목록으로 돌아갑니다.", "Quay lại danh sách bệnh nhân mà không thay đổi ghi chú.", "Gå tilbake til pasientlisten uten å endre notatet.", "ノートを変更せず患者一覧に戻ります。", "返回患者列表而不修改记录。", "חזרה לרשימת המטופלים ללא שינוי ההערה."),
row("patientClinicalNotes.help.editor", "This note is kept in the patient's local record. It is never sent automatically to OpenAI.", "Esta nota se conserva en el expediente local del paciente. Nunca se envía automáticamente a OpenAI.", "이 노트는 환자의 로컬 기록에 보관되며 OpenAI에 자동으로 전송되지 않습니다.", "Ghi chú này được lưu trong hồ sơ cục bộ của bệnh nhân. Ghi chú không bao giờ được tự động gửi đến OpenAI.", "Notatet lagres i pasientens lokale journal. Det sendes aldri automatisk til OpenAI.", "このノートは患者のローカル記録に保存されます。OpenAIへ自動送信されることはありません。", "此记录保存在患者的本地档案中，绝不会自动发送给 OpenAI。", "הערה זו נשמרת בתיק המקומי של המטופל. היא לעולם אינה נשלחת אוטומטית ל־OpenAI."),
row("patientClinicalNotes.help.save", "Each save creates a version. History lets you review or restore an earlier version.", "Cada guardado crea una versión. El historial permite revisar o restaurar una versión anterior.", "저장할 때마다 버전이 생성됩니다. 기록에서 이전 버전을 확인하거나 복원할 수 있습니다.", "Mỗi lần lưu tạo một phiên bản. Lịch sử cho phép xem lại hoặc khôi phục phiên bản trước.", "Hver lagring oppretter en versjon. Historikken lar deg lese eller gjenopprette en tidligere versjon.", "保存するたびに版が作成されます。履歴から以前の版を確認または復元できます。", "每次保存都会创建版本。历史可用于查看或恢复之前的版本。", "כל שמירה יוצרת גרסה. ההיסטוריה מאפשרת לעיין בגרסה קודמת או לשחזרה."),
row("patientClinicalNotes.help.history", "History shows this note's versions. Restoring a version replaces the current note and creates a new record.", "El historial muestra las versiones de esta nota. Restaurar una versión sustituye la nota actual y crea un nuevo registro.", "기록에는 이 노트의 버전이 표시됩니다. 버전을 복원하면 현재 노트가 대체되고 새 기록이 생성됩니다.", "Lịch sử hiển thị các phiên bản của ghi chú này. Khôi phục một phiên bản sẽ thay thế ghi chú hiện tại và tạo dấu vết mới.", "Historikken viser notatets versjoner. Gjenoppretting erstatter det gjeldende notatet og oppretter en ny registrering.", "履歴にはこのノートの各版が表示されます。版を復元すると現在のノートが置き換えられ、新しい記録が作成されます。", "历史显示此记录的版本。恢复版本会替换当前记录并生成新的记录轨迹。", "ההיסטוריה מציגה את גרסאות ההערה. שחזור גרסה מחליף את ההערה הנוכחית ויוצר רישום חדש."),
row("clinicalPatientSelection.searchLabel", "Search my patients", "Buscar entre mis pacientes", "내 환자 검색", "Tìm trong các bệnh nhân của tôi", "Søk blant mine pasienter", "自分の患者を検索", "搜索我的患者", "חיפוש במטופלים שלי"),
row("clinicalPatientSelection.searchPlaceholder", "Last or first name", "Apellido o nombre", "성 또는 이름", "Họ hoặc tên", "Etternavn eller fornavn", "姓または名", "姓或名", "שם משפחה או שם פרטי"),
row("clinicalPatientSelection.loading", "Searching patients...", "Buscando pacientes...", "환자 검색 중...", "Đang tìm bệnh nhân...", "Søker etter pasienter...", "患者を検索中...", "正在搜索患者...", "מחפש מטופלים..."),
row("clinicalPatientSelection.empty", "No matching patient.", "Ningún paciente coincide.", "일치하는 환자가 없습니다.", "Không có bệnh nhân phù hợp.", "Ingen samsvarende pasient.", "一致する患者はいません。", "没有匹配的患者。", "אין מטופל תואם."),
row("clinicalPatientSelection.selected", "Selected patient", "Paciente seleccionado", "선택된 환자", "Bệnh nhân đã chọn", "Valgt pasient", "選択した患者", "已选择患者", "המטופל שנבחר"),
row("clinicalPatientSelection.structuredOnly", "Structured parameters are prefilled. Free-text clinical notes are never sent automatically to AI.", "Los parámetros estructurados están precargados. Las notas clínicas de texto libre nunca se envían automáticamente a la IA.", "구조화된 매개변수가 미리 입력됩니다. 자유 형식 임상 노트는 AI에 자동으로 전송되지 않습니다.", "Các thông số có cấu trúc được điền sẵn. Ghi chú lâm sàng tự do không bao giờ được tự động gửi đến AI.", "Strukturerte parametere er forhåndsutfylt. Kliniske fritekstnotater sendes aldri automatisk til KI.", "構造化パラメータを自動入力します。自由記述の臨床ノートはAIへ自動送信されません。", "结构化参数已预填。自由文本临床记录绝不会自动发送给 AI。", "הפרמטרים המובנים ממולאים מראש. הערות קליניות בטקסט חופשי לעולם אינן נשלחות אוטומטית לבינה מלאכותית."),
row("clinicalPatientSelection.unsafeProfileNotSaved", "The parameters contain unapproved clinical text. They were not saved; correct the indicated fields before trying again.", "Los parámetros contienen texto clínico no aprobado. No se guardaron; corrija los campos indicados antes de volver a intentarlo.", "매개변수에 승인되지 않은 임상 텍스트가 포함되어 저장되지 않았습니다. 표시된 필드를 수정한 후 다시 시도하세요.", "Các thông số chứa văn bản lâm sàng chưa được phê duyệt. Chúng chưa được lưu; hãy sửa các trường được chỉ ra trước khi thử lại.", "Parameterne inneholder klinisk tekst som ikke er godkjent. De ble ikke lagret; rett de angitte feltene før du prøver igjen.", "パラメータに未承認の臨床テキストが含まれています。保存されていません。指定された項目を修正して再試行してください。", "参数包含未经批准的临床文本，因此未保存。请更正指定字段后重试。", "הפרמטרים מכילים טקסט קליני שלא אושר. הם לא נשמרו; יש לתקן את השדות המסומנים לפני ניסיון נוסף."),
row("clinicalPatientSelection.clear", "Return to manual entry", "Volver a la entrada manual", "수동 입력으로 돌아가기", "Quay lại nhập thủ công", "Gå tilbake til manuell registrering", "手動入力に戻る", "返回手动输入", "חזרה להזנה ידנית"),
row("clinicalSupportAccessRequestPage.title", "Available support requests", "Solicitudes de soporte disponibles", "사용 가능한 지원 요청", "Yêu cầu hỗ trợ có sẵn", "Tilgjengelige støtteforespørsler", "対応可能なサポート依頼", "可处理的支持请求", "בקשות תמיכה זמינות"),
row("clinicalSupportAccessRequestPage.description", "Take ownership of a request published by a physician. This does not grant record access: the physician must then explicitly approve your SUPERADMIN account.", "Asuma una solicitud publicada por un médico. Esto no da acceso al expediente: el médico deberá aprobar explícitamente su cuenta SUPERADMIN.", "의사가 게시한 요청을 담당합니다. 이 작업은 기록 접근 권한을 부여하지 않습니다. 이후 의사가 SUPERADMIN 계정을 명시적으로 승인해야 합니다.", "Nhận xử lý yêu cầu do bác sĩ đăng. Thao tác này không cấp quyền truy cập hồ sơ: bác sĩ phải phê duyệt rõ ràng tài khoản SUPERADMIN của bạn sau đó.", "Ta ansvar for en forespørsel publisert av en lege. Dette gir ikke journaltilgang: legen må deretter uttrykkelig godkjenne SUPERADMIN-kontoen din.", "医師が公開した依頼を担当します。この操作では記録へのアクセス権は付与されません。その後、医師があなたのSUPERADMINアカウントを明示的に承認する必要があります。", "接手医生发布的请求。此操作不授予档案访问权限，医生随后必须明确批准您的 SUPERADMIN 账户。", "קבלת אחריות על בקשה שפרסם רופא. הפעולה אינה מעניקה גישה לתיק: לאחר מכן הרופא יצטרך לאשר במפורש את חשבון SUPERADMIN שלך."),
row("clinicalSupportAccessRequestPage.loading", "Loading support requests...", "Cargando solicitudes de soporte...", "지원 요청 불러오는 중...", "Đang tải yêu cầu hỗ trợ...", "Laster støtteforespørsler...", "サポート依頼を読み込み中...", "正在加载支持请求...", "טוען בקשות תמיכה..."),
row("clinicalSupportAccessRequestPage.empty", "No support requests available.", "No hay solicitudes de soporte disponibles.", "사용 가능한 지원 요청이 없습니다.", "Không có yêu cầu hỗ trợ nào.", "Ingen støtteforespørsler tilgjengelig.", "対応可能なサポート依頼はありません。", "没有可处理的支持请求。", "אין בקשות תמיכה זמינות."),
row("clinicalSupportAccessRequestPage.requestedAt", "Requested on", "Solicitada el", "요청 일시", "Được yêu cầu vào", "Forespurt", "依頼日", "请求时间", "תאריך הבקשה"),
row("clinicalSupportAccessRequestPage.dossier", "Record reference", "Referencia del expediente", "기록 참조", "Mã tham chiếu hồ sơ", "Journalreferanse", "記録の参照番号", "档案参考编号", "מזהה התיק"),
row("clinicalSupportAccessRequestPage.reason", "Reason", "Motivo", "사유", "Lý do", "Årsak", "理由", "原因", "סיבה"),
row("clinicalSupportAccessRequestPage.justification", "Your justification", "Su justificación", "요청 근거", "Lý do của bạn", "Din begrunnelse", "あなたの理由", "您的理由说明", "הנימוק שלך"),
row("clinicalSupportAccessRequestPage.claim", "Take ownership", "Asumir solicitud", "담당하기", "Nhận xử lý", "Ta ansvar", "担当する", "接手处理", "קבלת אחריות"),
row("clinicalSupportAccessRequestPage.claiming", "Taking ownership...", "Asumiendo solicitud...", "담당 처리 중...", "Đang nhận xử lý...", "Tar ansvar...", "担当処理中...", "正在接手...", "מקבל אחריות..."),
row("clinicalSupportAccessRequestPage.claimed", "Request assigned to you. It is now awaiting the physician's approval.", "Solicitud asignada. Ahora está pendiente de la aprobación del médico.", "요청을 담당하게 되었습니다. 이제 의사의 승인을 기다립니다.", "Bạn đã nhận yêu cầu. Yêu cầu hiện đang chờ bác sĩ phê duyệt.", "Du har tatt ansvar for forespørselen. Den venter nå på legens godkjenning.", "依頼を担当しました。医師の承認待ちとなっています。", "已接手请求，正在等待医生批准。", "הבקשה הועברה לטיפולך. היא ממתינה כעת לאישור הרופא."),
row("clinicalSupportAccessRequestPage.reasons.technicalSupport", "Technical support", "Soporte técnico", "기술 지원", "Hỗ trợ kỹ thuật", "Teknisk støtte", "技術サポート", "技术支持", "תמיכה טכנית"),
row("clinicalSupportAccessRequestPage.reasons.securityIncident", "Security incident", "Incidente de seguridad", "보안 사고", "Sự cố bảo mật", "Sikkerhetshendelse", "セキュリティインシデント", "安全事件", "אירוע אבטחה"),
row("clinicalSupportAccessRequestPage.reasons.dataAccessRequest", "Data access request", "Solicitud de acceso a datos", "데이터 접근 요청", "Yêu cầu truy cập dữ liệu", "Forespørsel om datatilgang", "データアクセスの依頼", "数据访问请求", "בקשת גישה לנתונים"),
row("delegatedPatientAccessPage.title", "Temporarily authorized records", "Expedientes autorizados temporalmente", "임시 접근 승인된 기록", "Hồ sơ được cấp quyền tạm thời", "Midlertidig godkjente journaler", "一時的にアクセスが許可された記録", "临时授权档案", "תיקים שאושרו זמנית"),
row("delegatedPatientAccessPage.description", "This list contains only records for which you have active clinical authorization. Viewing is strictly read-only and audited.", "Esta lista solo contiene expedientes para los que tiene una autorización clínica activa. La consulta es estrictamente de solo lectura y auditada.", "이 목록에는 활성 임상 접근 권한이 있는 기록만 포함됩니다. 조회는 읽기 전용이며 감사 기록이 남습니다.", "Danh sách này chỉ gồm hồ sơ mà bạn có quyền lâm sàng đang có hiệu lực. Việc xem chỉ ở chế độ đọc và được ghi nhận kiểm toán.", "Listen inneholder bare journaler du har aktiv klinisk autorisasjon for. Visningen er strengt skrivebeskyttet og loggføres for revisjon.", "この一覧には、有効な臨床アクセス権を持つ記録のみが含まれます。閲覧は厳密に読み取り専用で、監査記録が残ります。", "此列表仅包含您拥有有效临床授权的档案。查看严格限于只读，并记录审计日志。", "רשימה זו כוללת רק תיקים שעבורם יש לך הרשאה קלינית פעילה. העיון הוא לקריאה בלבד ומתועד לביקורת."),
row("delegatedPatientAccessPage.refresh", "Refresh", "Actualizar", "새로 고침", "Làm mới", "Oppdater", "更新", "刷新", "רענון"),
row("delegatedPatientAccessPage.loading", "Loading active authorizations...", "Cargando autorizaciones activas...", "활성 권한 불러오는 중...", "Đang tải các quyền đang có hiệu lực...", "Laster aktive autorisasjoner...", "有効なアクセス権を読み込み中...", "正在加载有效授权...", "טוען הרשאות פעילות..."),
row("delegatedPatientAccessPage.empty", "No active clinical authorization.", "Ninguna autorización clínica activa.", "활성 임상 권한이 없습니다.", "Không có quyền lâm sàng đang có hiệu lực.", "Ingen aktiv klinisk autorisasjon.", "有効な臨床アクセス権はありません。", "没有有效的临床授权。", "אין הרשאה קלינית פעילה."),
row("delegatedPatientAccessPage.expiresAt", "Expires on", "Caduca el", "만료 일시", "Hết hạn vào", "Utløper", "有効期限", "到期时间", "תאריך תפוגה"),
row("delegatedPatientAccessPage.open", "Open read-only", "Abrir en solo lectura", "읽기 전용으로 열기", "Mở ở chế độ chỉ đọc", "Åpne skrivebeskyttet", "読み取り専用で開く", "以只读方式打开", "פתיחה לקריאה בלבד"),
row("delegatedPatientAccessPage.opening", "Opening...", "Abriendo...", "여는 중...", "Đang mở...", "Åpner...", "開いています...", "正在打开...", "פותח..."),
row("delegatedPatientAccessPage.readOnly", "Authorized record — read-only", "Expediente autorizado — solo lectura", "승인된 기록 — 읽기 전용", "Hồ sơ được cấp quyền — chỉ đọc", "Godkjent journal — skrivebeskyttet", "許可された記録 — 読み取り専用", "已授权档案 — 只读", "תיק מאושר — לקריאה בלבד"),
row("delegatedPatientAccessPage.patientName", "Patient", "Paciente", "환자", "Bệnh nhân", "Pasient", "患者", "患者", "מטופל"),
row("delegatedPatientAccessPage.insuranceNumber", "Health insurance number", "Número de seguro médico", "건강 보험 번호", "Số bảo hiểm y tế", "Helseforsikringsnummer", "健康保険番号", "医疗保险号码", "מספר ביטוח בריאות"),
row("delegatedPatientAccessPage.address", "Address", "Dirección", "주소", "Địa chỉ", "Adresse", "住所", "地址", "כתובת"),
row("delegatedPatientAccessPage.phone", "Phone", "Teléfono", "전화", "Điện thoại", "Telefon", "電話", "电话", "טלפון"),
row("delegatedPatientAccessPage.unavailable", "Unavailable", "No disponible", "사용 불가", "Không khả dụng", "Utilgjengelig", "利用不可", "不可用", "לא זמין"),
row("coordinationRequestsPage.title", "Coordination requests", "Solicitudes de coordinación", "조정 요청", "Yêu cầu điều phối", "Koordineringsforespørsler", "調整依頼", "协调请求", "בקשות תיאום"),
row("coordinationRequestsPage.description", "Track requests created when no specialist can be suggested.", "Seguimiento de solicitudes creadas cuando no se puede proponer un especialista.", "추천할 수 있는 전문의가 없을 때 생성된 요청을 추적합니다.", "Theo dõi các yêu cầu được tạo khi không thể đề xuất bác sĩ chuyên khoa.", "Følg forespørsler opprettet når ingen spesialist kan foreslås.", "専門医を提案できない場合に作成された依頼を追跡します。", "跟踪无法推荐专科医生时创建的请求。", "מעקב אחר בקשות שנוצרו כאשר לא ניתן להציע רופא מומחה."),
row("coordinationRequestsPage.allStatuses", "All statuses", "Todos los estados", "모든 상태", "Tất cả trạng thái", "Alle statuser", "すべての状態", "所有状态", "כל המצבים"),
row("coordinationRequestsPage.open", "Open", "Abierta", "열림", "Đang mở", "Åpen", "未対応", "开放", "פתוחה"),
row("coordinationRequestsPage.readyToSchedule", "Ready to schedule", "Lista para programar", "예약 준비됨", "Sẵn sàng lên lịch", "Klar til planlegging", "予約可能", "可安排预约", "מוכנה לקביעת תור"),
row("coordinationRequestsPage.resolved", "Resolved", "Resuelta", "해결됨", "Đã giải quyết", "Løst", "解決済み", "已解决", "טופלה"),
row("coordinationRequestsPage.cancelled", "Cancelled", "Cancelada", "취소됨", "Đã hủy", "Avbrutt", "キャンセル済み", "已取消", "בוטלה"),
row("coordinationRequestsPage.loading", "Loading coordination requests...", "Cargando solicitudes de coordinación...", "조정 요청 불러오는 중...", "Đang tải yêu cầu điều phối...", "Laster koordineringsforespørsler...", "調整依頼を読み込み中...", "正在加载协调请求...", "טוען בקשות תיאום..."),
row("coordinationRequestsPage.empty", "No coordination requests match this filter.", "No hay solicitudes de coordinación para este filtro.", "이 필터에 해당하는 조정 요청이 없습니다.", "Không có yêu cầu điều phối phù hợp với bộ lọc này.", "Ingen koordineringsforespørsler samsvarer med filteret.", "この条件に一致する調整依頼はありません。", "没有匹配此筛选条件的协调请求。", "אין בקשות תיאום התואמות למסנן זה."),
row("coordinationRequestsPage.createdAt", "Created on", "Creada el", "생성 일시", "Được tạo vào", "Opprettet", "作成日", "创建时间", "תאריך יצירה"),
row("coordinationRequestsPage.patientAnonymized", "Anonymized patient", "Paciente anonimizado", "익명화된 환자", "Bệnh nhân đã ẩn danh", "Anonymisert pasient", "匿名化された患者", "匿名患者", "מטופל שעבר אנונימיזציה"),
row("coordinationRequestsPage.specialty", "Specialty", "Especialidad", "전문 분야", "Chuyên khoa", "Spesialitet", "専門分野", "专科", "התמחות"),
row("coordinationRequestsPage.requestedBy", "Requested by", "Solicitada por", "요청자", "Người yêu cầu", "Forespurt av", "依頼者", "请求人", "מגיש הבקשה"),
row("coordinationRequestsPage.action", "Action", "Acción", "작업", "Thao tác", "Handling", "操作", "操作", "פעולה"),
row("coordinationRequestsPage.verifyAvailability", "Check availability", "Verificar disponibilidad", "가능 여부 확인", "Kiểm tra lịch trống", "Kontroller tilgjengelighet", "空き状況を確認", "检查可用性", "בדיקת זמינות"),
row("coordinationRequestsPage.verifying", "Checking...", "Verificando...", "확인 중...", "Đang kiểm tra...", "Kontrollerer...", "確認中...", "正在检查...", "בודק..."),
row("coordinationRequestsPage.availabilityVerified", "Availability confirmed: {clinic}, {specialist}, on {date} at {time}. The request is ready to schedule.", "Disponibilidad verificada: {clinic}, {specialist}, el {date} a las {time}. La solicitud está lista para programar.", "가능 여부 확인됨: {clinic}, {specialist}, {date} {time}. 요청을 예약할 수 있습니다.", "Đã xác nhận lịch trống: {clinic}, {specialist}, ngày {date} lúc {time}. Yêu cầu đã sẵn sàng để lên lịch.", "Tilgjengelighet bekreftet: {clinic}, {specialist}, {date} kl. {time}. Forespørselen er klar til planlegging.", "空き状況確認済み：{clinic}、{specialist}、{date} {time}。依頼は予約可能です。", "可用性已确认：{clinic}，{specialist}，{date} {time}。请求已可安排预约。", "הזמינות אושרה: {clinic}, {specialist}, בתאריך {date} בשעה {time}. הבקשה מוכנה לקביעת תור."),
row("coordinationRequestsPage.patientUnavailable", "Patient record unavailable", "Expediente del paciente no disponible", "환자 기록 사용 불가", "Hồ sơ bệnh nhân không khả dụng", "Pasientjournal utilgjengelig", "患者記録を利用できません", "患者档案不可用", "תיק המטופל אינו זמין"),
row("coordinationRequestsPage.requesterUnavailable", "User unavailable", "Usuario no disponible", "사용자 정보 사용 불가", "Người dùng không khả dụng", "Bruker utilgjengelig", "ユーザーを利用できません", "用户不可用", "המשתמש אינו זמין"),
row("coordinationRequestsPage.previous", "Previous", "Anterior", "이전", "Trước", "Forrige", "前へ", "上一页", "הקודמת"),
row("coordinationRequestsPage.next", "Next", "Siguiente", "다음", "Tiếp", "Neste", "次へ", "下一页", "הבאה"),
row("coordinationRequestsPage.page", "Page {page} of {totalPages}", "Página {page} de {totalPages}", "{totalPages}페이지 중 {page}페이지", "Trang {page} trên {totalPages}", "Side {page} av {totalPages}", "{totalPages}ページ中{page}ページ", "第 {page} 页，共 {totalPages} 页", "עמוד {page} מתוך {totalPages}"),
row("writeOperationAudits.title", "Database audits", "Auditorías de base de datos", "데이터베이스 감사", "Kiểm toán cơ sở dữ liệu", "Databaserevisjoner", "データベース監査", "数据库审计", "ביקורת מסד נתונים"),
row("writeOperationAudits.description", "Administrator summary of saved clinical writes, including the actor, collection, route, write concern and replica set status at the time of the operation.", "Resumen administrativo de las escrituras clínicas guardadas, con el actor, la colección, la ruta, el nivel de confirmación de escritura y el estado del conjunto de réplicas durante la operación.", "작업 시점의 수행자, 컬렉션, 경로, 쓰기 확인 수준 및 복제 세트 상태를 포함한 저장된 임상 쓰기 작업의 관리자 요약입니다.", "Tóm tắt dành cho quản trị viên về các thao tác ghi lâm sàng đã lưu, gồm người thực hiện, bộ sưu tập, đường dẫn, mức xác nhận ghi và trạng thái bộ bản sao tại thời điểm thao tác.", "Administratoroversikt over lagrede kliniske skriveoperasjoner, med aktør, samling, rute, skrivebekreftelse og replikasettets status da operasjonen ble utført.", "保存済みの臨床書き込みの管理者向け概要。実行者、コレクション、ルート、書き込み確認レベル、操作時のレプリカセットの状態を含みます。", "已保存临床写入的管理员概览，包括操作人、集合、路由、写入确认级别及操作时的副本集状态。", "סיכום למנהל של כתיבות קליניות שנשמרו, הכולל את המבצע, האוסף, הנתיב, רמת אישור הכתיבה ומצב מערך ההעתקים בזמן הפעולה."),
row("writeOperationAudits.summary.total", "Total", "Total", "합계", "Tổng", "Totalt", "合計", "总计", "סך הכול"),
row("writeOperationAudits.summary.operations", "Operations", "Operaciones", "작업", "Thao tác", "Operasjoner", "操作", "操作", "פעולות"),
row("writeOperationAudits.summary.replica", "Replica", "Réplica", "복제본", "Bản sao", "Replika", "レプリカ", "副本", "העתק"),
row("writeOperationAudits.summary.majorityUnavailable", "Majority unavailable", "Mayoría no disponible", "과반수 사용 불가", "Đa số không khả dụng", "Flertall utilgjengelig", "過半数を利用できません", "多数不可用", "הרוב אינו זמין"),
row("writeOperationAudits.filters.collection", "Collection", "Colección", "컬렉션", "Bộ sưu tập", "Samling", "コレクション", "集合", "אוסף"),
row("writeOperationAudits.filters.operation", "Operation", "Operación", "작업", "Thao tác", "Operasjon", "操作", "操作", "פעולה"),
row("writeOperationAudits.filters.outcome", "Outcome", "Resultado", "결과", "Kết quả", "Resultat", "結果", "结果", "תוצאה"),
row("writeOperationAudits.filters.replica", "Replica status", "Estado de réplica", "복제본 상태", "Trạng thái bản sao", "Replikastatus", "レプリカの状態", "副本状态", "מצב ההעתק"),
row("writeOperationAudits.filters.majority", "Majority", "Mayoría", "과반수", "Đa số", "Flertall", "過半数", "多数", "רוב"),
row("writeOperationAudits.filters.actorRole", "Actor role", "Rol del actor", "수행자 역할", "Vai trò người thực hiện", "Aktørrolle", "実行者の役割", "操作人角色", "תפקיד המבצע"),
row("writeOperationAudits.filters.actorUserId", "Actor user ID", "ID de usuario del actor", "수행자 사용자 ID", "ID người dùng thực hiện", "Aktørens bruker-ID", "実行者のユーザーID", "操作人用户 ID", "מזהה המשתמש המבצע"),
row("writeOperationAudits.filters.verificationId", "Verification ID", "ID de verificación", "검증 ID", "ID xác minh", "Bekreftelses-ID", "検証ID", "验证 ID", "מזהה אימות"),
row("writeOperationAudits.filters.clientMutationId", "Client mutation ID", "ID de modificación del cliente", "클라이언트 변경 ID", "ID thay đổi phía máy khách", "Klientens endrings-ID", "クライアント変更ID", "客户端变更 ID", "מזהה שינוי הלקוח"),
row("writeOperationAudits.filters.resourceId", "Resource ID", "ID de recurso", "리소스 ID", "ID tài nguyên", "Ressurs-ID", "リソースID", "资源 ID", "מזהה משאב"),
row("writeOperationAudits.filters.requestId", "Request ID", "ID de solicitud", "요청 ID", "ID yêu cầu", "Forespørsels-ID", "リクエストID", "请求 ID", "מזהה בקשה"),
row("writeOperationAudits.filters.startDate", "Start date", "Fecha de inicio", "시작 날짜", "Ngày bắt đầu", "Startdato", "開始日", "开始日期", "תאריך התחלה"),
row("writeOperationAudits.filters.endDate", "End date", "Fecha de fin", "종료 날짜", "Ngày kết thúc", "Sluttdato", "終了日", "结束日期", "תאריך סיום"),
row("writeOperationAudits.filters.allCollections", "All collections", "Todas las colecciones", "모든 컬렉션", "Tất cả bộ sưu tập", "Alle samlinger", "すべてのコレクション", "所有集合", "כל האוספים"),
row("writeOperationAudits.filters.allOperations", "All operations", "Todas las operaciones", "모든 작업", "Tất cả thao tác", "Alle operasjoner", "すべての操作", "所有操作", "כל הפעולות"),
row("writeOperationAudits.filters.allOutcomes", "All outcomes", "Todos los resultados", "모든 결과", "Tất cả kết quả", "Alle resultater", "すべての結果", "所有结果", "כל התוצאות"),
row("writeOperationAudits.filters.allReplicaStatuses", "All states", "Todos los estados", "모든 상태", "Tất cả trạng thái", "Alle tilstander", "すべての状態", "所有状态", "כל המצבים"),
row("writeOperationAudits.filters.allRoles", "All roles", "Todos los roles", "모든 역할", "Tất cả vai trò", "Alle roller", "すべての役割", "所有角色", "כל התפקידים"),
row("writeOperationAudits.placeholders.resourceId", "Document ID", "ID del documento", "문서 ID", "ID tài liệu", "Dokument-ID", "ドキュメントID", "文档 ID", "מזהה מסמך"),
row("writeOperationAudits.actions.showDetails", "Details", "Detalles", "상세 정보", "Chi tiết", "Detaljer", "詳細", "详情", "פרטים"),
row("writeOperationAudits.actions.refresh", "Refresh", "Actualizar", "새로 고침", "Làm mới", "Oppdater", "更新", "刷新", "רענון"),
row("writeOperationAudits.actions.hideDetails", "Hide", "Ocultar", "숨기기", "Ẩn", "Skjul", "非表示", "隐藏", "הסתרה"),
row("writeOperationAudits.status.loading", "Loading...", "Cargando...", "불러오는 중...", "Đang tải...", "Laster...", "読み込み中...", "正在加载...", "טוען..."),
row("writeOperationAudits.status.empty", "No database audit found.", "No se encontró ninguna auditoría de base de datos.", "데이터베이스 감사를 찾을 수 없습니다.", "Không tìm thấy kiểm toán cơ sở dữ liệu.", "Ingen databaserevisjon funnet.", "データベース監査は見つかりませんでした。", "未找到数据库审计。", "לא נמצאה ביקורת מסד נתונים."),
row("writeOperationAudits.status.results", "results", "resultados", "결과", "kết quả", "resultater", "件の結果", "条结果", "תוצאות"),
row("writeOperationAudits.receiptSearch.title", "Receipt search", "Búsqueda de comprobantes", "확인서 검색", "Tìm biên nhận", "Kvitteringssøk", "保存確認の検索", "回执搜索", "חיפוש קבלות"),
row("writeOperationAudits.receiptSearch.description", "Use the filters above to find receipts by period, user, collection or operation.", "Use los filtros anteriores para buscar comprobantes por período, usuario, colección u operación.", "위 필터를 사용하여 기간, 사용자, 컬렉션 또는 작업별로 확인서를 찾으세요.", "Sử dụng các bộ lọc trên để tìm biên nhận theo thời gian, người dùng, bộ sưu tập hoặc thao tác.", "Bruk filtrene ovenfor for å finne kvitteringer etter periode, bruker, samling eller operasjon.", "上のフィルターで期間、ユーザー、コレクション、操作ごとに保存確認を検索できます。", "使用上方筛选条件按时间段、用户、集合或操作查找回执。", "יש להשתמש במסננים למעלה למציאת קבלות לפי תקופה, משתמש, אוסף או פעולה."),
row("writeOperationAudits.receiptSearch.found", "receipt(s) found", "comprobante(s) encontrado(s)", "찾은 확인서", "biên nhận được tìm thấy", "kvitteringer funnet", "件の保存確認", "条回执已找到", "קבלות נמצאו"),
row("writeOperationAudits.receiptSearch.empty", "No receipts match the current filters.", "Ningún comprobante coincide con los filtros actuales.", "현재 필터에 일치하는 확인서가 없습니다.", "Không có biên nhận phù hợp với bộ lọc hiện tại.", "Ingen kvitteringer samsvarer med de gjeldende filtrene.", "現在の条件に一致する保存確認はありません。", "没有匹配当前筛选条件的回执。", "אין קבלות התואמות למסננים הנוכחיים."),
row("writeOperationAudits.receiptSearch.nearTitle", "Similar receipts", "Comprobantes similares", "유사한 확인서", "Biên nhận gần khớp", "Lignende kvitteringer", "近似する保存確認", "相似回执", "קבלות דומות"),
row("writeOperationAudits.receiptSearch.nearDescription", "No exact receipt found. Suggestions with prefix", "No se encontró un comprobante exacto. Sugerencias con el prefijo", "정확히 일치하는 확인서가 없습니다. 접두사가 포함된 제안", "Không tìm thấy biên nhận khớp chính xác. Gợi ý có tiền tố", "Ingen nøyaktig kvittering funnet. Forslag med prefikset", "完全に一致する保存確認はありません。次の接頭辞を含む候補", "未找到完全匹配的回执。包含此前缀的建议", "לא נמצאה קבלה תואמת בדיוק. הצעות עם הקידומת"),
row("writeOperationAudits.receiptSearch.copy", "Copy", "Copiar", "복사", "Sao chép", "Kopier", "コピー", "复制", "העתקה"),
row("writeOperationAudits.receiptSearch.copied", "Copied", "Copiado", "복사됨", "Đã sao chép", "Kopiert", "コピー済み", "已复制", "הועתק"),
row("writeOperationAudits.receiptSearch.date", "Date", "Fecha", "날짜", "Ngày", "Dato", "日付", "日期", "תאריך"),
row("writeOperationAudits.receiptSearch.actor", "Actor", "Actor", "수행자", "Người thực hiện", "Aktør", "実行者", "操作人", "מבצע"),
row("writeOperationAudits.receiptSearch.resources", "Resources", "Recursos", "리소스", "Tài nguyên", "Ressurser", "リソース", "资源", "משאבים"),
row("writeOperationAudits.table.title", "Detailed database audits", "Auditorías detalladas de base de datos", "상세 데이터베이스 감사", "Kiểm toán cơ sở dữ liệu chi tiết", "Detaljerte databaserevisjoner", "詳細なデータベース監査", "详细数据库审计", "ביקורת מפורטת של מסד הנתונים"),
row("writeOperationAudits.table.writeConcern", "Write concern", "Nivel de confirmación de escritura", "쓰기 확인 수준", "Mức xác nhận ghi", "Skrivebekreftelse", "書き込み確認レベル", "写入确认级别", "רמת אישור הכתיבה"),
row("writeOperationAudits.table.verification", "Verification", "Verificación", "검증", "Xác minh", "Bekreftelse", "検証", "验证", "אימות"),
row("writeOperationAudits.table.resource", "Resource", "Recurso", "리소스", "Tài nguyên", "Ressurs", "リソース", "资源", "משאב"),
row("writeOperationAudits.table.changedFields", "Fields", "Campos", "필드", "Trường", "Felter", "項目", "字段", "שדות"),
row("writeOperationAudits.table.request", "Request", "Solicitud", "요청", "Yêu cầu", "Forespørsel", "リクエスト", "请求", "בקשה"),
row("writeOperationAudits.table.healthy", "healthy", "saludable", "정상", "hoạt động tốt", "frisk", "正常", "健康", "תקין"),
row("writeOperationAudits.details.title", "Database audit details", "Detalles de auditoría de base de datos", "데이터베이스 감사 상세 정보", "Chi tiết kiểm toán cơ sở dữ liệu", "Detaljer for databaserevisjon", "データベース監査の詳細", "数据库审计详情", "פרטי ביקורת מסד הנתונים"),
row("writeOperationAudits.details.instanceId", "Instance", "Instancia", "인스턴스", "Phiên bản máy chủ", "Instans", "インスタンス", "实例", "מופע"),
row("writeOperationAudits.details.requestPath", "Route", "Ruta", "경로", "Đường dẫn", "Rute", "ルート", "路由", "נתיב"),
row("writeOperationAudits.details.ip", "IP", "IP", "IP", "IP", "IP", "IP", "IP", "IP"),
row("writeOperationAudits.details.changedFields", "Changed fields", "Campos modificados", "변경된 필드", "Các trường đã thay đổi", "Endrede felter", "変更された項目", "已更改字段", "שדות ששונו"),
row("writeOperationAudits.pagination.page", "Page", "Página", "페이지", "Trang", "Side", "ページ", "页", "עמוד"),
row("writeOperationAudits.pagination.previous", "Previous", "Anterior", "이전", "Trước", "Forrige", "前へ", "上一页", "הקודם"),
row("writeOperationAudits.pagination.next", "Next", "Siguiente", "다음", "Tiếp", "Neste", "次へ", "下一页", "הבא"),
];

function flatten(value: unknown): string[] {
    if (typeof value === "string") return [value];
    return value && typeof value === "object" ? Object.values(value).flatMap(flatten) : [];
}
const sources = new Set(clinicalUiGroups.flatMap(group => flatten(UI_LABELS_FR[group])));
const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const candidates = [...explicitRows, ...adminUiRows];
for (const entry of Object.values(compiled.byKey)) {
    const translations = languages.slice(1).map(language => (entry.translations as Record<string, string>)[language]);
    if (translations.every(value => validUiTranslation(entry.source, value))) candidates.push([entry.source, ...translations]);
}

// Technical identifier examples have no linguistic content and must stay literal.
const invariantSources = new Set<string>([
    UI_LABELS_FR.writeOperationAudits.placeholders.actorUserId,
    UI_LABELS_FR.writeOperationAudits.placeholders.verificationId,
    UI_LABELS_FR.writeOperationAudits.placeholders.clientMutationId,
    UI_LABELS_FR.writeOperationAudits.placeholders.requestId,
]);

export const clinicalUiRows: readonly (readonly string[])[] = [...sources].flatMap(source => {
    if (invariantSources.has(source)) return [languages.map(() => source)];
    const candidate = candidates.find(entry => normalized(entry[0]) === normalized(source));
    return candidate ? [[source, ...candidate.slice(1)]] : [];
});
const bySource = new Map(clinicalUiRows.map(entry => [entry[0], entry]));
export function localizeClinicalUiLabel(source: string, locale: string): string | null {
    const column = languages.indexOf(baseUiLocale(locale));
    return column >= 0 ? bySource.get(source)?.[column] ?? null : null;
}
