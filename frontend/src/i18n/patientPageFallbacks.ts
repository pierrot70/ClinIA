// Traductions locales des libellés courants de la page Patients. Elles sont
// dérivées de la source française versionnée et ne contiennent aucune donnée patient.
import { UI_LABELS_FR } from "./uiLabels.fr";
type PatientPageFallback = Record<string, string>;

const form = UI_LABELS_FR.patientsPage.form;
// French source, then EN, ES, KO, VI, NO, JA, ZH, HE; never patient-entered values.
export const patientFormRows: Array<readonly [string, string, string, string, string, string, string, string, string]> = [
    [form.firstNamePlaceholder, "First name *", "Nombre *", "이름 *", "Tên *", "Fornavn *", "名 *", "名字 *", "שם פרטי *"],
    [form.lastNamePlaceholder, "Last name *", "Apellido *", "성 *", "Họ *", "Etternavn *", "姓 *", "姓氏 *", "שם משפחה *"],
    [form.ramqPlaceholder, "Health insurance number (optional)", "Número de seguro médico (opcional)", "건강보험 번호 (선택 사항)", "Số bảo hiểm y tế (không bắt buộc)", "Helseforsikringsnummer (valgfritt)", "健康保険番号（任意）", "医疗保险号码（可选）", "מספר ביטוח בריאות (לא חובה)"],
    [form.phonePlaceholder, "Phone (optional)", "Teléfono (opcional)", "전화번호 (선택 사항)", "Số điện thoại (không bắt buộc)", "Telefon (valgfritt)", "電話番号（任意）", "电话号码（可选）", "טלפון (לא חובה)"],
    [form.emailPlaceholder, "Email (optional)", "Correo electrónico (opcional)", "이메일 (선택 사항)", "Email (không bắt buộc)", "E-post (valgfritt)", "メールアドレス（任意）", "电子邮件（可选）", "דוא״ל (לא חובה)"],
    [form.addressPlaceholder, "Address (optional)", "Dirección (opcional)", "주소 (선택 사항)", "Địa chỉ (không bắt buộc)", "Adresse (valgfritt)", "住所（任意）", "地址（可选）", "כתובת (לא חובה)"],
    [form.latitudePlaceholder, "Latitude (optional)", "Latitud (opcional)", "위도 (선택 사항)", "Vĩ độ (không bắt buộc)", "Breddegrad (valgfritt)", "緯度（任意）", "纬度（可选）", "קו רוחב (לא חובה)"],
    [form.longitudePlaceholder, "Longitude (optional)", "Longitud (opcional)", "경도 (선택 사항)", "Kinh độ (không bắt buộc)", "Lengdegrad (valgfritt)", "経度（任意）", "经度（可选）", "קו אורך (לא חובה)"],
    [form.smsEnabled, "SMS enabled", "SMS habilitados", "SMS 사용", "Đã bật SMS", "SMS aktivert", "SMS有効", "已启用短信", "SMS מופעל"],
    [form.create, "Create", "Crear", "생성", "Tạo", "Opprett", "作成", "创建", "יצירה"],
    [form.languageLabel, "Language", "Idioma", "언어", "Ngôn ngữ", "Språk", "言語", "语言", "שפה"],
];

export const patientAdministrativeLabels: Record<string, readonly [string, string, string, string]> = {
    fr: [UI_LABELS_FR.patientsPage.tabs.archived, UI_LABELS_FR.patientsPage.form.countryLabel, UI_LABELS_FR.patientsPage.form.healthInsuranceJurisdictionLabel, UI_LABELS_FR.patientsPage.form.healthInsuranceJurisdictionOptions.UNKNOWN],
    en: ["Archived records", "Country", "Insurance province or territory", "Not specified"],
    es: ["Expedientes archivados", "País", "Provincia o territorio del seguro", "No especificado"],
    ko: ["보관된 기록", "국가", "보험 관할 주 또는 준주", "미지정"],
    vi: ["Hồ sơ đã lưu trữ", "Quốc gia", "Tỉnh hoặc vùng lãnh thổ bảo hiểm", "Chưa xác định"],
    no: ["Arkiverte journaler", "Land", "Forsikringsprovins eller -territorium", "Ikke angitt"],
    ja: ["アーカイブ済み記録", "国", "保険の管轄州または準州", "未指定"],
    zh: ["已归档病历", "国家", "保险所属省或地区", "未指定"],
    he: ["תיקים בארכיון", "מדינה", "פרובינציה או טריטוריה של הביטוח", "לא צוין"],
};

const resultCountLabels: Record<string, readonly [string, string]> = {
    fr: [UI_LABELS_FR.patientsPage.search.resultSingular, UI_LABELS_FR.patientsPage.search.resultPlural],
    en: ["patient found", "patients found"],
    es: ["paciente encontrado", "pacientes encontrados"],
    ko: ["명의 환자를 찾았습니다", "명의 환자를 찾았습니다"],
    vi: ["bệnh nhân được tìm thấy", "bệnh nhân được tìm thấy"],
    no: ["pasient funnet", "pasienter funnet"],
    ja: ["人の患者が見つかりました", "人の患者が見つかりました"],
    zh: ["位患者已找到", "位患者已找到"],
    he: ["מטופל נמצא", "מטופלים נמצאו"],
};

const patientPageSource = {
    "Patients": true,
    "Créer un patient": true,
    "Rechercher les patients": true,
    "Dossiers archivés": true,
    "Recherche": true,
    "Nom": true,
    "Prénom": true,
    "Adresse": true,
    "Téléphone": true,
    "Numéro assurance maladie": true,
    "Actions": true,
    "Créer rendez-vous": true,
    "Éditer": true,
    "Notes cliniques": true,
    "Demander du soutien": true,
    "Demande de soutien en cours": true,
    "Archiver": true,
    "Réactiver": true,
    "Dossier archivé": true,
    "Archivé le": true,
    "Chargement...": true,
    "Aucun patient trouvé.": true,
    "Précédent": true,
    "Suivant": true,
    "Page": true,
} satisfies Record<string, true>;

export const patientPageFallbacks: Record<string, PatientPageFallback> = {
    zh: {
        "Patients": "患者", "Créer un patient": "创建患者", "Rechercher les patients": "搜索患者", "Dossiers archivés": "已归档病历", "Recherche": "搜索", "Nom": "姓氏", "Prénom": "名字", "Adresse": "地址", "Téléphone": "电话", "Numéro assurance maladie": "医疗保险号码", "Actions": "操作", "Créer rendez-vous": "创建预约", "Éditer": "编辑", "Notes cliniques": "临床备注", "Demander du soutien": "请求支持", "Demande de soutien en cours": "支持请求处理中", "Archiver": "归档", "Réactiver": "重新启用", "Dossier archivé": "已归档病历", "Archivé le": "归档日期", "Chargement...": "加载中...", "Aucun patient trouvé.": "未找到患者。", "Précédent": "上一页", "Suivant": "下一页", "Page": "页",
    },
    ja: {
        "Patients": "患者", "Créer un patient": "患者を作成", "Rechercher les patients": "患者を検索", "Dossiers archivés": "アーカイブ済み記録", "Recherche": "検索", "Nom": "姓", "Prénom": "名", "Adresse": "住所", "Téléphone": "電話番号", "Numéro assurance maladie": "健康保険番号", "Actions": "操作", "Créer rendez-vous": "予約を作成", "Éditer": "編集", "Notes cliniques": "臨床メモ", "Demander du soutien": "サポートを依頼", "Demande de soutien en cours": "サポート依頼を処理中", "Archiver": "アーカイブ", "Réactiver": "再有効化", "Dossier archivé": "アーカイブ済み記録", "Archivé le": "アーカイブ日", "Chargement...": "読み込み中...", "Aucun patient trouvé.": "患者が見つかりません。", "Précédent": "前へ", "Suivant": "次へ", "Page": "ページ",
    },
    no: {
        "Patients": "Pasienter", "Créer un patient": "Opprett pasient", "Rechercher les patients": "Søk etter pasienter", "Dossiers archivés": "Arkiverte journaler", "Recherche": "Søk", "Nom": "Etternavn", "Prénom": "Fornavn", "Adresse": "Adresse", "Téléphone": "Telefon", "Numéro assurance maladie": "Helseforsikringsnummer", "Actions": "Handlinger", "Créer rendez-vous": "Opprett avtale", "Éditer": "Rediger", "Notes cliniques": "Kliniske notater", "Demander du soutien": "Be om støtte", "Demande de soutien en cours": "Støtteforespørsel pågår", "Archiver": "Arkiver", "Réactiver": "Aktiver på nytt", "Dossier archivé": "Arkivert journal", "Archivé le": "Arkivert den", "Chargement...": "Laster...", "Aucun patient trouvé.": "Ingen pasienter funnet.", "Précédent": "Forrige", "Suivant": "Neste", "Page": "Side",
    },
    vi: {
        "Patients": "Bệnh nhân", "Créer un patient": "Tạo bệnh nhân", "Rechercher les patients": "Tìm bệnh nhân", "Dossiers archivés": "Hồ sơ đã lưu trữ", "Recherche": "Tìm kiếm", "Nom": "Họ", "Prénom": "Tên", "Adresse": "Địa chỉ", "Téléphone": "Điện thoại", "Numéro assurance maladie": "Số bảo hiểm y tế", "Actions": "Thao tác", "Créer rendez-vous": "Tạo lịch hẹn", "Éditer": "Chỉnh sửa", "Notes cliniques": "Ghi chú lâm sàng", "Demander du soutien": "Yêu cầu hỗ trợ", "Demande de soutien en cours": "Yêu cầu hỗ trợ đang xử lý", "Archiver": "Lưu trữ", "Réactiver": "Kích hoạt lại", "Dossier archivé": "Hồ sơ đã lưu trữ", "Archivé le": "Đã lưu trữ ngày", "Chargement...": "Đang tải...", "Aucun patient trouvé.": "Không tìm thấy bệnh nhân.", "Précédent": "Trước", "Suivant": "Tiếp", "Page": "Trang",
    },
    ko: {
        "Patients": "환자", "Créer un patient": "환자 만들기", "Rechercher les patients": "환자 검색", "Dossiers archivés": "보관된 기록", "Recherche": "검색", "Nom": "성", "Prénom": "이름", "Adresse": "주소", "Téléphone": "전화", "Numéro assurance maladie": "건강보험 번호", "Actions": "작업", "Créer rendez-vous": "예약 만들기", "Éditer": "편집", "Notes cliniques": "임상 메모", "Demander du soutien": "지원 요청", "Demande de soutien en cours": "지원 요청 처리 중", "Archiver": "보관", "Réactiver": "다시 활성화", "Dossier archivé": "보관된 기록", "Archivé le": "보관일", "Chargement...": "불러오는 중...", "Aucun patient trouvé.": "환자를 찾을 수 없습니다.", "Précédent": "이전", "Suivant": "다음", "Page": "페이지",
    },
};

export function getPatientPageFallback(text: string, targetBase: string): string | null {
    const row = patientFormRows.find(row => row[0] === text);
    if (row) {
        const index = ["fr", "en", "es", "ko", "vi", "no", "ja", "zh", "he"].indexOf(targetBase);
        return index < 0 ? null : row[index];
    }
    const administrativeIndex = patientAdministrativeLabels.fr.indexOf(text);
    if (administrativeIndex >= 0) return patientAdministrativeLabels[targetBase]?.[administrativeIndex] ?? null;
    const countLabels = resultCountLabels[targetBase];
    if (text === UI_LABELS_FR.patientsPage.search.resultSingular) return countLabels?.[0] ?? null;
    if (text === UI_LABELS_FR.patientsPage.search.resultPlural) return countLabels?.[1] ?? null;
    if (!(text in patientPageSource)) return null;
    return patientPageFallbacks[targetBase]?.[text] || null;
}
