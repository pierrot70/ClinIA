import { UI_LABELS_FR } from "./uiLabels.fr";
import { baseUiLocale } from "./uiLocales";
const l = UI_LABELS_FR.residualClinicalUi;
// Fixed clinical interface wording, never clinical response or patient content.
// French source, then EN, ES, KO, VI, NO, JA, ZH, HE.
export const residualUiRows: readonly (readonly string[])[] = [
[l.proposedOptions, "Proposed treatment options", "Opciones terapéuticas propuestas", "제안된 치료 선택지", "Các lựa chọn điều trị được đề xuất", "Foreslåtte behandlingsalternativer", "提案された治療選択肢", "建议的治疗选项", "אפשרויות טיפול מוצעות"],
[l.treatment, "Treatment", "Tratamiento", "치료", "Điều trị", "Behandling", "治療", "治疗", "טיפול"],
[l.rationale, "Rationale", "Justificación", "근거", "Lý do", "Begrunnelse", "根拠", "理由", "נימוק"],
[l.contraindications, "Contraindications", "Contraindicaciones", "금기 사항", "Chống chỉ định", "Kontraindikasjoner", "禁忌", "禁忌证", "התוויות נגד"],
[l.clinicalOption, "Clinical option", "Opción clínica", "임상 선택지", "Lựa chọn lâm sàng", "Klinisk alternativ", "臨床的選択肢", "临床选项", "אפשרות קלינית"],
[l.rationaleInSource, "Clinical rationale available in the source analysis.", "La justificación clínica está disponible en el análisis original.", "임상 근거는 원본 분석에서 확인할 수 있습니다.", "Lý do lâm sàng có trong phân tích gốc.", "Klinisk begrunnelse er tilgjengelig i kildeanalysen.", "臨床的根拠は元の分析で確認できます。", "临床理由可在原始分析中查看。", "הנימוק הקליני זמין בניתוח המקורי."],
[l.detailsInSource, "Clinical details are available in the source analysis.", "Los detalles clínicos están disponibles en el análisis original.", "임상 세부 정보는 원본 분석에서 확인할 수 있습니다.", "Chi tiết lâm sàng có trong phân tích gốc.", "Kliniske detaljer er tilgjengelige i kildeanalysen.", "臨床詳細は元の分析で確認できます。", "临床详情可在原始分析中查看。", "הפרטים הקליניים זמינים בניתוח המקורי."],
[l.noneListed, "None listed", "Ninguna indicada", "명시된 사항 없음", "Không có mục nào được liệt kê", "Ingen oppgitt", "記載なし", "未列出", "לא צוינו"],
[l.prioritySuffix, " is presented as a priority option to discuss according to the clinical context.", " se presenta como opción prioritaria para discutir según el contexto clínico.", "은(는) 임상 상황에 따라 논의할 우선 선택지로 제시됩니다.", " được trình bày là lựa chọn ưu tiên để thảo luận theo bối cảnh lâm sàng.", " presenteres som et prioritert alternativ som bør diskuteres ut fra den kliniske konteksten.", "は臨床的背景に応じて検討する優先的な選択肢として提示されています。", "被列为应根据临床背景讨论的优先选项。", " מוצג כאפשרות מועדפת לדיון בהתאם להקשר הקליני."],
[l.mainProfileQuestion, "What is the main clinical profile identified here?", "¿Cuál es el perfil clínico principal identificado aquí?", "여기에서 확인된 주요 임상 프로필은 무엇입니까?", "Hồ sơ lâm sàng chính được xác định ở đây là gì?", "Hva er den viktigste kliniske profilen som er identifisert her?", "ここで示された主な臨床プロフィールは何ですか？", "此处确定的主要临床概况是什么？", "מהו הפרופיל הקליני העיקרי שזוהה כאן?"],
[l.optionContext, "This option stands out in the current clinical context.", "Esta opción destaca en el contexto clínico actual.", "이 선택지는 현재 임상 상황에서 두드러집니다.", "Lựa chọn này nổi bật trong bối cảnh lâm sàng hiện tại.", "Dette alternativet skiller seg ut i den aktuelle kliniske konteksten.", "この選択肢は現在の臨床的背景で注目されます。", "此选项在当前临床背景中较为突出。", "אפשרות זו בולטת בהקשר הקליני הנוכחי."],
[l.optionQuestion, "Why does {name} stand out as an option to discuss?", "¿Por qué {name} destaca como opción para discutir?", "{name}이(가) 논의할 선택지로 두드러지는 이유는 무엇입니까?", "Vì sao {name} nổi bật như một lựa chọn cần thảo luận?", "Hvorfor skiller {name} seg ut som et alternativ som bør diskuteres?", "{name}が検討すべき選択肢として注目される理由は何ですか？", "为什么 {name} 是值得讨论的突出选项？", "מדוע {name} בולט כאפשרות לדיון?"],
[l.monitoringQuestion, "Which monitoring points require attention?", "¿Qué puntos de seguimiento requieren atención?", "어떤 모니터링 사항에 주의해야 합니까?", "Những điểm theo dõi nào cần chú ý?", "Hvilke oppfølgingspunkter krever oppmerksomhet?", "どの観察項目に注意が必要ですか？", "哪些监测要点需要关注？", "אילו נקודות מעקב דורשות תשומת לב?"],
[l.contraindicationsQuestion, "Which contraindications or limitations should be reviewed?", "¿Qué contraindicaciones o limitaciones deben revisarse?", "어떤 금기 사항이나 제한 사항을 검토해야 합니까?", "Cần xem xét những chống chỉ định hoặc hạn chế nào?", "Hvilke kontraindikasjoner eller begrensninger bør gjennomgås?", "どの禁忌や制限を確認すべきですか？", "应该复核哪些禁忌证或限制？", "אילו התוויות נגד או מגבלות יש לבדוק?"],
[l.analysisErrorTitle, "AI analysis error", "Error de análisis de IA", "AI 분석 오류", "Lỗi phân tích AI", "Feil i KI-analyse", "AI分析エラー", "AI 分析错误", "שגיאה בניתוח בינה מלאכותית"],
[l.saturatedHelp, "The service is temporarily saturated. Try again later or contact an administrator.", "El servicio está temporalmente saturado. Vuelva a intentarlo más tarde o contacte con un administrador.", "서비스가 일시적으로 과부하 상태입니다. 나중에 다시 시도하거나 관리자에게 문의하세요.", "Dịch vụ tạm thời quá tải. Hãy thử lại sau hoặc liên hệ quản trị viên.", "Tjenesten er midlertidig overbelastet. Prøv igjen senere eller kontakt en administrator.", "サービスは一時的に混雑しています。後で再試行するか、管理者にお問い合わせください。", "服务暂时过载。请稍后重试或联系管理员。", "השירות עמוס זמנית. יש לנסות שוב מאוחר יותר או לפנות למנהל."],
[l.retryHelp, "Please check the clinical data and try again.", "Revise los datos clínicos y vuelva a intentarlo.", "임상 데이터를 확인하고 다시 시도하세요.", "Vui lòng kiểm tra dữ liệu lâm sàng và thử lại.", "Kontroller de kliniske dataene og prøv igjen.", "臨床データを確認し、再試行してください。", "请检查临床数据后重试。", "יש לבדוק את הנתונים הקליניים ולנסות שוב."],
[l.requestRetained, "The clinical request remains available to help report the error.", "La solicitud clínica sigue disponible para facilitar el reporte del error.", "오류 보고를 돕기 위해 임상 요청이 계속 제공됩니다.", "Yêu cầu lâm sàng vẫn có sẵn để hỗ trợ báo cáo lỗi.", "Den kliniske forespørselen er fortsatt tilgjengelig for å gjøre det enklere å rapportere feilen.", "エラーの報告に使えるよう、臨床要求は引き続き参照できます。", "临床请求仍可查看，以便报告错误。", "הבקשה הקלינית נשארת זמינה כדי להקל על דיווח השגיאה."],
];
const languages = ["fr", "en", "es", "ko", "vi", "no", "ja", "zh", "he"];
export function localizeResidualUiLabel(source: string, locale: string): string | null {
    const column = languages.indexOf(baseUiLocale(locale));
    const row = residualUiRows.find(entry => entry[0] === source);
    return column >= 0 ? row?.[column] ?? null : null;
}
