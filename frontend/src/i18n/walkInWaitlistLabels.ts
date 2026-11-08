import { UI_LABELS_FR } from "./uiLabels.fr";
import { baseUiLocale } from "./uiLocales";

const source = UI_LABELS_FR.walkInWaitlist;
const languages = ["fr", "en", "es", "ko", "vi", "no", "ja", "zh", "he"];
const rows: Record<keyof typeof source, readonly string[]> = {
    enroll: [source.enroll, "Join the waitlist", "Inscribir en la lista de espera", "대기 명단에 등록", "Đăng ký danh sách chờ", "Sett på venteliste", "待機リストに登録", "加入候补名单", "רישום לרשימת ההמתנה"],
    channel: [source.channel, "Preferred contact method", "Medio de contacto elegido", "선호 연락 방법", "Phương thức liên hệ đã chọn", "Valgt kontaktmåte", "希望する連絡方法", "首选联系方式", "אמצעי הקשר שנבחר"],
    chooseChannel: [source.chooseChannel, "Choose a contact method", "Elegir un medio de contacto", "연락 방법 선택", "Chọn cách liên hệ", "Velg kontaktmåte", "連絡方法を選択", "选择联系方式", "בחירת אמצעי קשר"],
    sms: [source.sms, "SMS", "SMS", "문자 메시지", "SMS", "SMS", "SMS", "短信", "מסרון"],
    email: [source.email, "Email", "Correo electrónico", "이메일", "Email", "E-post", "メール", "电子邮件", "דוא״ל"],
    phone: [source.phone, "Phone call", "Llamada telefónica", "전화 통화", "Cuộc gọi", "Telefonsamtale", "電話", "电话", "שיחת טלפון"],
    emailAddress: [source.emailAddress, "Email address", "Dirección de correo electrónico", "이메일 주소", "Địa chỉ email", "E-postadresse", "メールアドレス", "电子邮件地址", "כתובת דוא״ל"],
    phoneNumber: [source.phoneNumber, "Phone number", "Número de teléfono", "전화번호", "Số điện thoại", "Telefonnummer", "電話番号", "电话号码", "מספר טלפון"],
    consent: [source.consent, "The patient agrees to join the waitlist and be contacted using the selected method.", "El paciente acepta inscribirse en la lista de espera y que se le contacte por el medio elegido.", "환자는 대기 명단 등록 및 선택한 방법으로 연락받는 데 동의합니다.", "Người bệnh đồng ý vào danh sách chờ và được liên hệ theo cách đã chọn.", "Pasienten samtykker til ventelisten og til å bli kontaktet på valgt måte.", "患者は待機リストへの登録と、選択した方法で連絡を受けることに同意します。", "患者同意加入候补名单并通过所选方式接收联系。", "המטופל מסכים להירשם לרשימת ההמתנה ולקבל פנייה באמצעי שנבחר."],
    save: [source.save, "Save enrollment", "Guardar inscripción", "등록 저장", "Lưu đăng ký", "Lagre påmeldingen", "登録を保存", "保存登记", "שמירת הרישום"],
    saving: [source.saving, "Saving the enrollment…", "Guardando la inscripción…", "등록을 저장하는 중…", "Đang lưu đăng ký…", "Lagrer påmeldingen…", "登録を保存中…", "正在保存登记…", "הרישום נשמר…"],
    saved: [source.saved, "The patient was added to the waitlist.", "El paciente se ha añadido a la lista de espera.", "환자가 대기 명단에 등록되었습니다.", "Người bệnh đã được thêm vào danh sách chờ.", "Pasienten er satt på ventelisten.", "患者を待機リストに登録しました。", "患者已加入候补名单。", "המטופל נרשם לרשימת ההמתנה."],
    clinicLimit: [source.clinicLimit, "This patient is already on two clinic waitlists.", "Este paciente ya está en la lista de espera de dos clínicas.", "이 환자는 이미 두 클리닉의 대기 명단에 있습니다.", "Người bệnh đã có tên trong danh sách chờ của hai phòng khám.", "Pasienten står allerede på venteliste ved to klinikker.", "この患者はすでに2つのクリニックの待機リストに登録されています。", "该患者已加入两家诊所的候补名单。", "המטופל כבר נמצא ברשימות ההמתנה של שתי מרפאות."],
    duplicate: [source.duplicate, "This patient is already on this clinic’s waitlist.", "El paciente ya está en la lista de espera de esta clínica.", "이 환자는 이미 이 클리닉의 대기 명단에 있습니다.", "Người bệnh đã có tên trong danh sách chờ của phòng khám này.", "Pasienten står allerede på ventelisten ved denne klinikken.", "この患者はすでにこのクリニックの待機リストに登録されています。", "该患者已在本诊所的候补名单上。", "המטופל כבר נמצא ברשימת ההמתנה של המרפאה."],
    searchChanged: [source.searchChanged, "Search for the patient and available appointments again before enrolling them.", "Vuelva a buscar al paciente y las citas disponibles antes de inscribirlo.", "등록하기 전에 환자와 예약 가능 시간을 다시 검색하세요.", "Tìm lại người bệnh và các lịch trống trước khi đăng ký.", "Søk etter pasienten og ledige timer på nytt før påmelding.", "登録する前に、患者と空き枠をもう一度検索してください。", "登记前请重新搜索患者及可用时段。", "לפני הרישום יש לחפש שוב את המטופל ואת התורים הפנויים."],
    invalid: [source.invalid, "Check the contact detail and selected contact method.", "Verifique el dato de contacto y el medio elegido.", "연락처와 선택한 연락 방법을 확인하세요.", "Kiểm tra thông tin và cách liên hệ đã chọn.", "Kontroller kontaktopplysningen og valgt kontaktmåte.", "連絡先と選択した連絡方法を確認してください。", "请核对联系方式和所选联系渠道。", "יש לבדוק את פרטי הקשר ואת אמצעי הקשר שנבחר."],
    unavailable: [source.unavailable, "The enrollment could not be saved right now.", "No se puede guardar la inscripción en este momento.", "지금은 등록을 저장할 수 없습니다.", "Hiện không thể lưu đăng ký.", "Påmeldingen kunne ikke lagres nå.", "現在、登録を保存できません。", "暂时无法保存登记。", "לא ניתן לשמור את הרישום כעת."],
};

export function walkInWaitlistLabels(locale: string): { [K in keyof typeof source]: string } {
    const index = languages.indexOf(baseUiLocale(locale));
    return Object.fromEntries(Object.entries(rows).map(([key, translations]) =>
        [key, translations[index] ?? translations[1]]
    )) as { [K in keyof typeof source]: string };
}
