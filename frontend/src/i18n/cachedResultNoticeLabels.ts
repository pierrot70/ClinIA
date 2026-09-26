import { UI_LABELS_FR } from "./uiLabels.fr";

type NoticeLabels = { [K in keyof typeof UI_LABELS_FR.clinicalDemo.cachedResultNotice]: string };
const translations: Record<string, NoticeLabels> = {
  en: {
    title: "Equivalent analysis already available",
    description: "ClinIA found an equivalent clinical analysis that was already saved. No new OpenAI request was needed.",
    viewResultAction: "View result",
    refreshHint: "To trigger a new analysis, return to the parameters, update the relevant clinical information, then click Analyze again. A forced rerun of an identical request must be requested from a SUPERADMIN.",
    editParametersAction: "Edit clinical parameters",
  },
  es: {
    title: "Ya existe un análisis equivalente",
    description: "ClinIA encontró un análisis clínico equivalente guardado. No fue necesaria una nueva solicitud a OpenAI.",
    viewResultAction: "Ver resultado",
    refreshHint: "Para iniciar un nuevo análisis, vuelva a los parámetros, actualice la información clínica pertinente y pulse Analizar de nuevo. Solicite a un SUPERADMIN la repetición forzada de una solicitud idéntica.",
    editParametersAction: "Editar parámetros clínicos",
  },
  vi: {
    title: "Đã có phân tích tương đương",
    description: "ClinIA tìm thấy một phân tích lâm sàng tương đương đã được lưu. Không cần gửi yêu cầu mới đến OpenAI.",
    viewResultAction: "Xem kết quả",
    refreshHint: "Để bắt đầu phân tích mới, hãy quay lại các thông số, cập nhật thông tin lâm sàng liên quan rồi nhấn Phân tích lần nữa. Việc buộc chạy lại yêu cầu giống hệt phải được yêu cầu qua SUPERADMIN.",
    editParametersAction: "Sửa thông số lâm sàng",
  },
  no: {
    title: "En tilsvarende analyse finnes allerede",
    description: "ClinIA fant en tilsvarende lagret klinisk analyse. Ingen ny forespørsel til OpenAI var nødvendig.",
    viewResultAction: "Vis resultat",
    refreshHint: "For å starte en ny analyse, gå tilbake til parameterne, oppdater relevant klinisk informasjon og klikk på Analyser igjen. Be en SUPERADMIN om å tvinge frem en ny kjøring av en identisk forespørsel.",
    editParametersAction: "Rediger kliniske parametere",
  },
  ja: {
    title: "同等の分析が既にあります",
    description: "ClinIAは保存済みの同等の臨床分析を見つけました。OpenAIへの新たなリクエストは不要でした。",
    viewResultAction: "結果を見る",
    refreshHint: "新しい分析を開始するには、パラメータに戻り、関連する臨床情報を更新してから、再度「分析」を押してください。同一リクエストの強制再実行はSUPERADMINに依頼してください。",
    editParametersAction: "臨床パラメータを編集",
  },
  zh: {
    title: "已有等效分析",
    description: "ClinIA找到了已保存的等效临床分析，无需向OpenAI发送新请求。",
    viewResultAction: "查看结果",
    refreshHint: "如需进行新分析，请返回参数页面，更新相关临床信息，然后再次点击分析。强制重新执行相同请求须向SUPERADMIN申请。",
    editParametersAction: "编辑临床参数",
  },
  he: {
    title: "ניתוח מקביל כבר זמין",
    description: "ClinIA מצאה ניתוח קליני מקביל שכבר נשמר. לא נדרשה בקשה חדשה ל-OpenAI.",
    viewResultAction: "הצגת התוצאה",
    refreshHint: "כדי להתחיל ניתוח חדש, חזרו לפרמטרים, עדכנו את המידע הקליני הרלוונטי ולחצו שוב על ניתוח. יש לבקש מ-SUPERADMIN הרצה חוזרת כפויה של בקשה זהה.",
    editParametersAction: "עריכת פרמטרים קליניים",
  },
  ko: {
    title: "동등한 분석이 이미 있습니다",
    description: "ClinIA가 저장된 동등한 임상 분석을 찾았습니다. 새로운 OpenAI 요청이 필요하지 않았습니다.",
    viewResultAction: "결과 보기",
    refreshHint: "새 분석을 시작하려면 매개변수로 돌아가 관련 임상 정보를 업데이트한 다음 분석을 다시 누르세요. 동일한 요청의 강제 재실행은 SUPERADMIN에게 요청해야 합니다.",
    editParametersAction: "임상 매개변수 수정",
  },
};

export function getCachedResultNoticeLabels(locale: string): NoticeLabels {
  return translations[locale.toLowerCase().split("-")[0]] ?? UI_LABELS_FR.clinicalDemo.cachedResultNotice;
}
