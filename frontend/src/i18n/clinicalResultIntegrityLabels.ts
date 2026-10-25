import { UI_LABELS_FR } from "./uiLabels.fr";
import { baseUiLocale } from "./uiLocales";
type IntegrityLabels = { [K in keyof typeof UI_LABELS_FR.clinicalResultIntegrity]: string };
const translations: Record<string, IntegrityLabels> = {
 en: { summaryWithheld: "Summary withheld: the supplied information does not establish glycemic control. Review the submitted parameters and complete the clinical assessment.", noOptions: "No structured therapeutic option was provided in this response. No simulated example has been substituted.", sourceFields: "Additional information from the source option" },
 es: { summaryWithheld: "Resumen no mostrado: la información proporcionada no permite establecer el control glucémico. Revise los parámetros enviados y complete la evaluación clínica.", noOptions: "Esta respuesta no proporcionó ninguna opción terapéutica estructurada. No se ha sustituido por un ejemplo simulado.", sourceFields: "Información adicional de la opción original" },
 ko: { summaryWithheld: "제공된 정보로 혈당 조절을 판단할 수 없어 요약을 표시하지 않습니다. 제출한 매개변수를 검토하고 임상 평가를 완료하세요.", noOptions: "이 응답에는 구조화된 치료 선택지가 제공되지 않았습니다. 시뮬레이션 예시로 대체하지 않았습니다.", sourceFields: "원본 선택지의 추가 정보" },
 vi: { summaryWithheld: "Không hiển thị tóm tắt: thông tin được cung cấp chưa xác định được kiểm soát đường huyết. Xem lại các thông số đã gửi và hoàn tất đánh giá lâm sàng.", noOptions: "Phản hồi này không cung cấp lựa chọn điều trị có cấu trúc. Không thay thế bằng ví dụ mô phỏng.", sourceFields: "Thông tin bổ sung từ lựa chọn nguồn" },
 no: { summaryWithheld: "Sammendraget vises ikke: de oppgitte opplysningene fastslår ikke glykemisk kontroll. Se gjennom innsendte parametere og fullfør den kliniske vurderingen.", noOptions: "Svaret inneholdt ingen strukturert behandlingsmulighet. Ingen simulert eksempel er satt inn.", sourceFields: "Tilleggsinformasjon fra det opprinnelige alternativet" },
 ja: { summaryWithheld: "提供された情報では血糖コントロールを判断できないため、要約を表示していません。送信したパラメータを確認し、臨床評価を完了してください。", noOptions: "この回答には構造化された治療選択肢がありません。シミュレーション例への置き換えは行っていません。", sourceFields: "元の選択肢の補足情報" },
 zh: { summaryWithheld: "未显示摘要：所提供的信息不足以确定血糖控制情况。请查看提交的参数并完成临床评估。", noOptions: "此回答未提供结构化的治疗选项，未使用模拟示例替代。", sourceFields: "原始选项的补充信息" },
 he: { summaryWithheld: "הסיכום אינו מוצג: המידע שנמסר אינו מאפשר לקבוע איזון גליקמי. יש לעיין בפרמטרים שנשלחו ולהשלים את ההערכה הקלינית.", noOptions: "לא ניתנה אפשרות טיפולית מובנית בתשובה זו. לא הוחלפה בדוגמה מדומה.", sourceFields: "מידע נוסף מהאפשרות המקורית" },
};
export function clinicalResultIntegrityLabels(locale: string): IntegrityLabels {
 return translations[baseUiLocale(locale)] ?? UI_LABELS_FR.clinicalResultIntegrity;
}
