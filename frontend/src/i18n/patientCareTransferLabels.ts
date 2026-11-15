import { UI_LABELS_FR } from "./uiLabels.fr";
import { baseUiLocale } from "./uiLocales";

const source = UI_LABELS_FR.patientCareTransfer;
type TransferLabels = { [K in keyof typeof source]: K extends "status"
    ? { [S in keyof typeof source.status]: string } : string };
type Translation = readonly [string, string, string, string, string, string, string, string];

const rows: Record<Exclude<keyof TransferLabels, "status">, Translation> = {
    title: ["Record transfers", "Transferencias de expedientes", "진료기록 이관", "Chuyển giao hồ sơ", "Journaloverføringer", "診療記録の引き継ぎ", "病历移交", "העברת תיקים"],
    start: ["Transfer this record", "Transferir este expediente", "이 진료기록 이관", "Chuyển giao hồ sơ này", "Overfør denne journalen", "この診療記録を引き継ぐ", "移交此病历", "העברת תיק זה"],
    sendHeading: ["Request a record transfer", "Solicitar la transferencia de un expediente", "진료기록 이관 요청", "Yêu cầu chuyển giao hồ sơ", "Be om overføring av journal", "診療記録の引き継ぎを依頼", "申请移交病历", "בקשה להעברת תיק"],
    outgoing: ["Sent requests", "Solicitudes enviadas", "보낸 요청", "Yêu cầu đã gửi", "Sendte forespørsler", "送信した依頼", "已发送的申请", "בקשות שנשלחו"],
    incoming: ["Received requests", "Solicitudes recibidas", "받은 요청", "Yêu cầu đã nhận", "Mottatte forespørsler", "受信した依頼", "收到的申请", "בקשות שהתקבלו"],
    ipsInstructions: ["Open a record you are responsible for to request its transfer.", "Abra un expediente a su cargo para solicitar su transferencia.", "담당 중인 진료기록을 열어 이관을 요청하세요.", "Mở hồ sơ do bạn phụ trách để yêu cầu chuyển giao.", "Åpne en journal du har ansvar for, for å be om overføring.", "担当している診療記録を開いて、引き継ぎを依頼してください。", "打开您负责的病历以申请移交。", "פתחו תיק שבאחריותכם כדי לבקש את העברתו."],
    doctorInstructions: ["Review requests addressed to you before deciding whether to take responsibility for the record.", "Revise las solicitudes que se le han enviado antes de decidir si asume la responsabilidad del expediente.", "진료기록을 맡을지 결정하기 전에 받은 요청을 검토하세요.", "Xem các yêu cầu gửi đến bạn trước khi quyết định tiếp nhận hồ sơ.", "Gjennomgå forespørslene til deg før du bestemmer om du vil overta ansvaret.", "記録の担当を引き受けるか決める前に、自分宛ての依頼を確認してください。", "决定是否接管病历前，请查看发送给您的申请。", "עיינו בבקשות שנשלחו אליכם לפני שתחליטו אם לקבל אחריות על התיק."],
    choosePhysician: ["Receiving family physician", "Médico de familia destinatario", "수신 가정의학과 의사", "Bác sĩ gia đình tiếp nhận", "Mottakende fastlege", "引き継ぎ先の家庭医", "接收病历的家庭医生", "רופא המשפחה המקבל"],
    selectPhysician: ["Select a family physician", "Seleccionar a un médico de familia", "가정의학과 의사 선택", "Chọn bác sĩ gia đình", "Velg en fastlege", "家庭医を選択", "选择家庭医生", "בחירת רופא משפחה"],
    noPhysicians: ["No active family physician can receive this request.", "Ningún médico de familia activo puede recibir esta solicitud.", "이 요청을 받을 수 있는 활성 가정의학과 의사가 없습니다.", "Không có bác sĩ gia đình đang hoạt động nào có thể nhận yêu cầu này.", "Ingen aktive fastleger kan motta denne forespørselen.", "この依頼を受け取れる有効な家庭医がいません。", "没有可接收此申请的在岗家庭医生。", "אין רופא משפחה פעיל שיכול לקבל את הבקשה."],
    consent: ["I confirm that the patient agreed to transfer their record to this physician.", "Confirmo que el paciente aceptó que se transfiera su expediente a este médico.", "환자가 이 의사에게 자신의 진료기록을 이관하는 데 동의했음을 확인합니다.", "Tôi xác nhận người bệnh đã đồng ý chuyển giao hồ sơ cho bác sĩ này.", "Jeg bekrefter at pasienten har samtykket til at journalen overføres til denne legen.", "患者がこの医師への診療記録の引き継ぎに同意したことを確認します。", "我确认患者已同意将病历移交给这位医生。", "אני מאשר שהמטופל הסכים להעביר את תיקו לרופא זה."],
    terms: ["The designated physician can view the record in read-only mode for 24 hours. You remain responsible until the physician accepts.", "El médico designado puede consultar el expediente en modo de solo lectura durante 24 horas. Usted conserva la responsabilidad hasta que lo acepte.", "지정된 의사는 24시간 동안 진료기록을 읽기 전용으로 열람할 수 있습니다. 의사가 수락할 때까지 기존 담당자가 책임을 유지합니다.", "Bác sĩ được chỉ định có thể xem hồ sơ ở chế độ chỉ đọc trong 24 giờ. Bạn vẫn phụ trách hồ sơ cho đến khi bác sĩ chấp nhận.", "Den valgte legen kan lese journalen i 24 timer. Du beholder ansvaret til legen godtar forespørselen.", "指定された医師は24時間、読み取り専用で記録を閲覧できます。医師が承諾するまでは、あなたが担当を継続します。", "指定医生可在 24 小时内只读查看病历。医生接受前，您仍负责该病历。", "הרופא שנבחר יכול לעיין בתיק לקריאה בלבד במשך 24 שעות. האחריות נשארת אצלכם עד שהרופא יקבל את הבקשה."],
    send: ["Send request", "Enviar solicitud", "요청 보내기", "Gửi yêu cầu", "Send forespørsel", "依頼を送信", "发送申请", "שליחת בקשה"],
    open: ["View the record in read-only mode", "Consultar el expediente en modo de solo lectura", "진료기록 읽기 전용 열람", "Xem hồ sơ ở chế độ chỉ đọc", "Åpne journalen med lesetilgang", "診療記録を読み取り専用で開く", "以只读方式查看病历", "עיון בתיק לקריאה בלבד"],
    openAccepted: ["View the transferred record", "Consultar el expediente transferido", "이관된 진료기록 열람", "Xem hồ sơ đã chuyển giao", "Åpne den overførte journalen", "引き継いだ診療記録を開く", "查看已移交的病历", "עיון בתיק שהועבר"],
    review: ["The preview is read-only. By accepting, you become responsible for this record in ClinIA.", "La consulta es de solo lectura. Al aceptar, asume la responsabilidad de este expediente en ClinIA.", "미리보기는 읽기 전용입니다. 수락하면 ClinIA에서 이 진료기록의 담당자가 됩니다.", "Bản xem trước chỉ cho phép đọc. Khi chấp nhận, bạn sẽ phụ trách hồ sơ này trong ClinIA.", "Forhåndsvisningen er skrivebeskyttet. Hvis du godtar, overtar du ansvaret for journalen i ClinIA.", "プレビューは読み取り専用です。承諾すると、ClinIAでこの記録の担当になります。", "预览仅可读取。接受后，您将在 ClinIA 中负责此病历。", "התצוגה המקדימה זמינה לקריאה בלבד. בקבלת הבקשה תקבלו אחריות על התיק ב־ClinIA."],
    accept: ["Accept the transfer", "Aceptar la transferencia", "이관 수락", "Chấp nhận chuyển giao", "Godta overføringen", "引き継ぎを承諾", "接受移交", "קבלת ההעברה"],
    decline: ["Decline the transfer", "Rechazar la transferencia", "이관 거절", "Từ chối chuyển giao", "Avslå overføringen", "引き継ぎを辞退", "拒绝移交", "דחיית ההעברה"],
    cancel: ["Withdraw the request", "Retirar la solicitud", "요청 철회", "Rút yêu cầu", "Trekk forespørselen", "依頼を取り下げる", "撤回申请", "משיכת הבקשה"],
    closeRecord: ["Close the record", "Cerrar el expediente", "진료기록 닫기", "Đóng hồ sơ", "Lukk journalen", "診療記録を閉じる", "关闭病历", "סגירת התיק"],
    empty: ["No transfer requests.", "No hay solicitudes de transferencia.", "이관 요청이 없습니다.", "Không có yêu cầu chuyển giao.", "Ingen forespørsler om overføring.", "引き継ぎ依頼はありません。", "暂无移交申请。", "אין בקשות העברה."],
    hiddenPatient: ["Record outside your access scope", "Expediente fuera de su ámbito de acceso", "열람 범위를 벗어난 진료기록", "Hồ sơ ngoài phạm vi truy cập của bạn", "Journal utenfor din tilgang", "アクセス範囲外の診療記録", "此病历不在您的访问范围内", "התיק מחוץ לתחום הגישה שלכם"],
    alreadyPending: ["A request is already pending for this record.", "Ya hay una solicitud pendiente para este expediente.", "이 진료기록에 이미 대기 중인 요청이 있습니다.", "Hồ sơ này đã có một yêu cầu đang chờ xử lý.", "En forespørsel for denne journalen venter allerede på svar.", "この記録にはすでに保留中の依頼があります。", "此病历已有一项待处理的申请。", "כבר קיימת בקשה הממתינה להחלטה עבור תיק זה."],
    conflict: ["This physician already has a record with conflicting identification details. The transfer remains pending.", "Este médico ya tiene un expediente con datos de identificación en conflicto. La transferencia sigue pendiente.", "이 의사에게 식별 정보가 충돌하는 진료기록이 이미 있습니다. 이관은 대기 상태로 유지됩니다.", "Bác sĩ này đã có hồ sơ với thông tin định danh bị trùng. Yêu cầu chuyển giao vẫn đang chờ xử lý.", "Legen har allerede en journal med identitetsopplysninger som er i konflikt. Overføringen venter fortsatt på avklaring.", "この医師には識別情報が重複する記録がすでにあります。引き継ぎは保留のままです。", "该医生已有身份信息冲突的病历。移交仍处于待处理状态。", "לרופא כבר יש תיק עם פרטי זיהוי סותרים. ההעברה נשארת בהמתנה."],
    consentRequired: ["Confirm the patient's agreement before sending the request.", "Confirme el consentimiento del paciente antes de enviar la solicitud.", "요청을 보내기 전에 환자의 동의를 확인하세요.", "Xác nhận sự đồng ý của người bệnh trước khi gửi yêu cầu.", "Bekreft pasientens samtykke før du sender forespørselen.", "依頼を送信する前に患者の同意を確認してください。", "请先确认患者同意，再发送申请。", "אשרו את הסכמת המטופל לפני שליחת הבקשה."],
    sent: ["Request sent.", "Solicitud enviada.", "요청을 보냈습니다.", "Đã gửi yêu cầu.", "Forespørselen er sendt.", "依頼を送信しました。", "申请已发送。", "הבקשה נשלחה."],
    accepted: ["Transfer accepted. You are now responsible for the record.", "Transferencia aceptada. Ahora está a cargo del expediente.", "이관을 수락했습니다. 이제 이 진료기록의 담당자입니다.", "Đã chấp nhận chuyển giao. Bạn hiện phụ trách hồ sơ này.", "Overføringen er godtatt. Du har nå ansvaret for journalen.", "引き継ぎを承諾しました。この記録の担当はあなたになりました。", "移交已接受。您现在负责此病历。", "ההעברה התקבלה. התיק נמצא כעת באחריותכם."],
    declined: ["Transfer declined.", "Transferencia rechazada.", "이관을 거절했습니다.", "Đã từ chối chuyển giao.", "Overføringen er avslått.", "引き継ぎを辞退しました。", "移交已拒绝。", "ההעברה נדחתה."],
    cancelled: ["Request withdrawn.", "Solicitud retirada.", "요청을 철회했습니다.", "Đã rút yêu cầu.", "Forespørselen er trukket.", "依頼を取り下げました。", "申请已撤回。", "הבקשה נמשכה."],
};
const status: Record<keyof TransferLabels["status"], Translation> = {
    PENDING: ["Pending", "Pendiente", "대기 중", "Đang chờ", "Venter", "保留中", "待处理", "בהמתנה"],
    ACCEPTED: ["Accepted", "Aceptada", "수락됨", "Đã chấp nhận", "Godtatt", "承諾済み", "已接受", "התקבלה"],
    DECLINED: ["Declined", "Rechazada", "거절됨", "Đã từ chối", "Avslått", "辞退済み", "已拒绝", "נדחתה"],
    CANCELLED: ["Withdrawn", "Retirada", "철회됨", "Đã rút", "Trukket", "取り下げ済み", "已撤回", "נמשכה"],
    EXPIRED: ["Expired", "Caducada", "만료됨", "Đã hết hạn", "Utløpt", "期限切れ", "已过期", "פג תוקף"],
};

const languages = ["en", "es", "ko", "vi", "no", "ja", "zh", "he"];
export function patientCareTransferLabels(locale: string): TransferLabels {
    const language = baseUiLocale(locale);
    if (language === "fr") return source;
    const column = Math.max(0, languages.indexOf(language));
    const translate = (entries: Record<string, Translation>) =>
        Object.fromEntries(Object.entries(entries).map(([key, translations]) => [key, translations[column]]));
    return { ...translate(rows), status: translate(status) } as TransferLabels;
}
