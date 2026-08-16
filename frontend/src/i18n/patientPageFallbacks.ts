// Traductions locales des libellés courants de la page Patients. Elles sont
// dérivées de la source française versionnée et ne contiennent aucune donnée patient.
type PatientPageFallback = Record<string, string>;

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
    if (!(text in patientPageSource)) return null;
    return patientPageFallbacks[targetBase]?.[text] || null;
}
