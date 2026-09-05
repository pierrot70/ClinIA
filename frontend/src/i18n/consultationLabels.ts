import { UI_LABELS_FR } from "./uiLabels.fr";

type Labels = { [K in keyof typeof UI_LABELS_FR.consultations]: string };
export const CONSULTATION_LABELS: Record<string, Labels> = {
    "fr-CA": UI_LABELS_FR.consultations,
    "en-CA": {
        title: "Consultations", description: "Open an appointment to review the history. An appointment does not establish ongoing care.",
        refresh: "Refresh", open: "Open", empty: "No consultations available (100 most recent appointments).", history: "Note history", legacy: "Previous record note",
        ownOnly: "Completed consultation: only your notes for this appointment are available without ongoing care.",
        add: "New note — write in English", save: "Add note", noteHelp: "The note will be stored separately with its author. It cannot be edited here. Nothing is sent to an AI service.",
        accept: "Accept ongoing care", confirm: "Confirm adding this patient to your practice? This is separate from the appointment.",
        accepted: "This patient is under your ongoing care.", saved: "Saved.", error: "Action unavailable. Refresh the page and check your access permissions.", loading: "Loading…", author: "Author",
    },
    es: {
        title: "Consultas", description: "Abra una cita para consultar el historial. Una cita no establece una atención permanente.",
        refresh: "Actualizar", open: "Abrir", empty: "No hay consultas disponibles (las 100 citas más recientes).", history: "Historial de notas", legacy: "Nota anterior del expediente",
        ownOnly: "Consulta finalizada: sin atención permanente, solo puede acceder a sus notas de esta cita.",
        add: "Nueva nota — escriba en inglés", save: "Añadir nota", noteHelp: "La nota se guardará por separado con su autor. No podrá editarse aquí. No se envía nada a un servicio de IA.",
        accept: "Aceptar la atención permanente", confirm: "¿Confirma incorporar a este paciente a su consulta? Esta acción es independiente de la cita.",
        accepted: "Este paciente está bajo su atención permanente.", saved: "Guardado.", error: "Acción no disponible. Actualice la página y compruebe sus permisos.", loading: "Cargando…", author: "Autor",
    },
    "ko-KR": {
        title: "진료", description: "예약을 열어 기록을 확인하세요. 예약만으로 지속적인 담당 관계가 설정되지는 않습니다.",
        refresh: "새로 고침", open: "열기", empty: "이용 가능한 진료가 없습니다 (최근 예약 100건).", history: "진료 기록", legacy: "기존 환자 기록",
        ownOnly: "진료가 완료되었습니다. 지속적인 담당 관계가 없으면 이 예약에서 본인이 작성한 기록만 볼 수 있습니다.",
        add: "새 기록 — 영어로 작성하세요", save: "기록 추가", noteHelp: "기록은 작성자와 함께 별도로 저장됩니다. 여기서는 수정할 수 없습니다. AI 서비스로 전송되지 않습니다.",
        accept: "지속적인 진료 담당 수락", confirm: "이 환자를 지속적으로 담당하시겠습니까? 예약과는 별개의 결정입니다.",
        accepted: "지속적으로 담당하는 환자입니다.", saved: "저장되었습니다.", error: "작업을 수행할 수 없습니다. 페이지를 새로 고치고 접근 권한을 확인하세요.", loading: "불러오는 중…", author: "작성자",
    },
    vi: {
        title: "Lượt khám", description: "Mở lịch hẹn để xem lịch sử. Lịch hẹn không có nghĩa là nhận chăm sóc lâu dài.",
        refresh: "Làm mới", open: "Mở", empty: "Không có lượt khám (100 lịch hẹn gần nhất).", history: "Lịch sử ghi chú", legacy: "Ghi chú trước đó trong hồ sơ",
        ownOnly: "Lượt khám đã hoàn tất: nếu chưa nhận chăm sóc lâu dài, bạn chỉ có thể xem ghi chú của mình cho lịch hẹn này.",
        add: "Ghi chú mới — viết bằng tiếng Anh", save: "Thêm ghi chú", noteHelp: "Ghi chú được lưu riêng cùng tác giả. Không thể chỉnh sửa tại đây. Không gửi đến dịch vụ AI.",
        accept: "Nhận chăm sóc lâu dài", confirm: "Xác nhận nhận bệnh nhân này vào danh sách chăm sóc lâu dài? Việc này độc lập với lịch hẹn.",
        accepted: "Bệnh nhân này được bạn chăm sóc lâu dài.", saved: "Đã lưu.", error: "Không thể thực hiện. Hãy làm mới trang và kiểm tra quyền truy cập.", loading: "Đang tải…", author: "Tác giả",
    },
    "no-NO": {
        title: "Konsultasjoner", description: "Åpne en time for å se historikken. En time innebærer ikke et fast behandlingsansvar.",
        refresh: "Oppdater", open: "Åpne", empty: "Ingen konsultasjoner tilgjengelig (de 100 siste timene).", history: "Notathistorikk", legacy: "Tidligere journalnotat",
        ownOnly: "Avsluttet konsultasjon: uten fast behandlingsansvar kan du bare lese dine egne notater fra denne timen.",
        add: "Nytt notat — skriv på engelsk", save: "Legg til notat", noteHelp: "Notatet lagres separat med forfatter. Det kan ikke redigeres her. Ingenting sendes til en KI-tjeneste.",
        accept: "Godta fast behandlingsansvar", confirm: "Vil du ta denne pasienten inn i din faste pasientgruppe? Dette er uavhengig av timen.",
        accepted: "Du har fast behandlingsansvar for denne pasienten.", saved: "Lagret.", error: "Handlingen er ikke tilgjengelig. Oppdater siden og kontroller tilgangsrettighetene.", loading: "Laster…", author: "Forfatter",
    },
    ja: {
        title: "診察", description: "予約を開いて履歴を確認できます。予約だけでは継続的な担当関係は成立しません。",
        refresh: "更新", open: "開く", empty: "利用可能な診察はありません（直近100件の予約）。", history: "記録の履歴", legacy: "既存の診療記録",
        ownOnly: "診察は終了しています。継続的な担当関係がない場合、この予約で自分が作成した記録のみ閲覧できます。",
        add: "新しい記録 — 英語で入力してください", save: "記録を追加", noteHelp: "記録は作成者とともに個別に保存されます。ここでは編集できません。AIサービスには送信されません。",
        accept: "継続的な担当を引き受ける", confirm: "この患者の継続的な担当を引き受けますか？予約とは別の判断です。",
        accepted: "この患者は継続的に担当する患者です。", saved: "保存しました。", error: "操作できません。ページを更新してアクセス権限を確認してください。", loading: "読み込み中…", author: "作成者",
    },
    zh: {
        title: "诊疗", description: "打开预约以查看历史记录。预约并不代表建立长期诊疗关系。",
        refresh: "刷新", open: "打开", empty: "暂无可用诊疗（最近100次预约）。", history: "记录历史", legacy: "原有病历记录",
        ownOnly: "诊疗已结束：若未建立长期诊疗关系，您只能查看本次预约中自己撰写的记录。",
        add: "新记录 — 请用英语撰写", save: "添加记录", noteHelp: "记录将与作者信息单独保存，无法在此修改。不会发送至任何AI服务。",
        accept: "接受长期诊疗责任", confirm: "确认将此患者纳入您的长期诊疗名单？此操作与预约无关。",
        accepted: "此患者由您长期负责诊疗。", saved: "已保存。", error: "无法执行操作。请刷新页面并检查访问权限。", loading: "正在加载…", author: "作者",
    },
    he: {
        title: "מפגשים", description: "פתחו תור לצפייה בהיסטוריה. קביעת תור אינה יוצרת אחריות קבועה לטיפול.",
        refresh: "רענון", open: "פתיחה", empty: "אין מפגשים זמינים (100 התורים האחרונים).", history: "היסטוריית רשומות", legacy: "רשומה קודמת בתיק",
        ownOnly: "המפגש הסתיים: ללא אחריות קבועה לטיפול, ניתן לצפות רק ברשומות שכתבתם לתור זה.",
        add: "רשומה חדשה — יש לכתוב באנגלית", save: "הוספת רשומה", noteHelp: "הרשומה תישמר בנפרד עם פרטי המחבר. לא ניתן לערוך אותה כאן. דבר אינו נשלח לשירות בינה מלאכותית.",
        accept: "קבלת אחריות קבועה לטיפול", confirm: "האם לצרף מטופל זה לרשימת המטופלים הקבועים שלכם? זוהי פעולה נפרדת מקביעת התור.",
        accepted: "מטופל זה נמצא בטיפולכם הקבוע.", saved: "נשמר.", error: "לא ניתן לבצע את הפעולה. רעננו את הדף ובדקו את הרשאות הגישה.", loading: "טוען…", author: "מחבר",
    },
};
export function consultationLabels(locale: string): Labels {
    return CONSULTATION_LABELS[locale] || CONSULTATION_LABELS["en-CA"];
}
