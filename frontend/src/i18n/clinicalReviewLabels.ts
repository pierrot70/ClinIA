import { UI_LABELS_FR } from './uiLabels.fr';
type Labels = { [K in keyof typeof UI_LABELS_FR.clinicalReview]: string };
const keys = Object.keys(UI_LABELS_FR.clinicalReview) as (keyof Labels)[];
const rows: Record<string, string[]> = {
 en: ['Parameters submitted for analysis','Age (years)','Sex','Diagnosis or clinical reason','Weight (kg)','Height (cm)','Symptoms','Medical history','Current medications','Not provided','Male','Female','Other','Copy request JSON','Request JSON copied to the clipboard.','Unable to copy automatically. Try again or contact a SUPERADMIN.'],
 es: ['Parámetros enviados para el análisis','Edad (años)','Sexo','Diagnóstico o motivo clínico','Peso (kg)','Estatura (cm)','Síntomas','Antecedentes médicos','Medicamentos actuales','No indicado','Masculino','Femenino','Otro','Copiar solicitud JSON','Solicitud JSON copiada al portapapeles.','No se pudo copiar automáticamente. Inténtelo de nuevo o contacte con un SUPERADMIN.'],
 ko: ['분석에 제출된 매개변수','나이 (세)','성별','진단 또는 임상 사유','체중 (kg)','키 (cm)','증상','병력','현재 복용 약물','미입력','남성','여성','기타','요청 JSON 복사','요청 JSON을 클립보드에 복사했습니다.','자동으로 복사할 수 없습니다. 다시 시도하거나 SUPERADMIN에게 문의하세요.'],
 vi: ['Thông số đã gửi để phân tích','Tuổi (năm)','Giới tính','Chẩn đoán hoặc lý do lâm sàng','Cân nặng (kg)','Chiều cao (cm)','Triệu chứng','Tiền sử bệnh','Thuốc hiện tại','Chưa cung cấp','Nam','Nữ','Khác','Sao chép yêu cầu JSON','Đã sao chép yêu cầu JSON vào bộ nhớ tạm.','Không thể sao chép tự động. Hãy thử lại hoặc liên hệ SUPERADMIN.'],
 no: ['Parametere sendt til analyse','Alder (år)','Kjønn','Diagnose eller klinisk årsak','Vekt (kg)','Høyde (cm)','Symptomer','Sykehistorie','Nåværende legemidler','Ikke oppgitt','Mann','Kvinne','Annet','Kopier forespørsel som JSON','JSON-forespørselen er kopiert til utklippstavlen.','Kan ikke kopiere automatisk. Prøv igjen eller kontakt en SUPERADMIN.'],
 ja: ['分析に送信したパラメータ','年齢（歳）','性別','診断または臨床的理由','体重（kg）','身長（cm）','症状','既往歴','現在の薬剤','未入力','男性','女性','その他','リクエストJSONをコピー','リクエストJSONをクリップボードにコピーしました。','自動コピーできません。再試行するかSUPERADMINにお問い合わせください。'],
 zh: ['已提交分析的参数','年龄（岁）','性别','诊断或临床原因','体重（kg）','身高（cm）','症状','病史','当前用药','未提供','男','女','其他','复制请求JSON','请求JSON已复制到剪贴板。','无法自动复制。请重试或联系SUPERADMIN。'],
 he: ['הפרמטרים שנשלחו לניתוח','גיל (שנים)','מין','אבחנה או סיבה קלינית','משקל (ק״ג)','גובה (ס״מ)','תסמינים','היסטוריה רפואית','תרופות נוכחיות','לא נמסר','זכר','נקבה','אחר','העתקת הבקשה כ-JSON','בקשת ה-JSON הועתקה ללוח.','לא ניתן להעתיק אוטומטית. נסו שוב או פנו ל-SUPERADMIN.'],
};
export const clinicalReviewTranslations: Record<string, Labels> = { fr: UI_LABELS_FR.clinicalReview };
for (const [locale, values] of Object.entries(rows)) {
 if (values.length !== keys.length) throw new Error(`Incomplete clinical review labels: ${locale}`);
 clinicalReviewTranslations[locale] = Object.fromEntries(keys.map((key, i) => [key, values[i]])) as Labels;
}
export const clinicalReviewLabels = (locale: string): Labels => clinicalReviewTranslations[locale.toLowerCase().split('-')[0]] || clinicalReviewTranslations.en;
