import { UI_LABELS_FR } from "./uiLabels.fr";
import { baseUiLocale } from "./uiLocales";

const languages = ["fr", "en", "es", "ko", "vi", "no", "ja", "zh", "he"];
const f = UI_LABELS_FR.clinicalFormFields;
const c = UI_LABELS_FR.clinicalExampleConceptLabels;
const s = UI_LABELS_FR.clinicalSymptomLabels;
export const clinicalFormFieldRows: readonly (readonly string[])[] = [
[f.diabetesModalTitle, "Additional clinical parameters — Type 2 diabetes", "Parámetros clínicos adicionales — Diabetes tipo 2", "추가 임상 매개변수 — 제2형 당뇨병", "Thông số lâm sàng bổ sung — Đái tháo đường típ 2", "Ytterligere kliniske parametere — Diabetes type 2", "追加の臨床パラメータ — 2型糖尿病", "补充临床参数 — 2型糖尿病", "פרמטרים קליניים נוספים — סוכרת מסוג 2"],
[f.diabetesModalDescription, "Adjust these parameters to enrich the analysis without adding to the main clinical data.", "Ajuste estos parámetros para enriquecer el análisis sin sobrecargar los datos clínicos principales.", "주요 임상 데이터에 부담을 더하지 않고 분석을 보완하도록 이 매개변수를 조정하세요.", "Điều chỉnh các thông số này để bổ sung cho phân tích mà không làm phức tạp dữ liệu lâm sàng chính.", "Juster disse parameterne for å berike analysen uten å gjøre de viktigste kliniske opplysningene mer omfattende.", "主要な臨床データを複雑にせずに分析を充実させるため、これらのパラメータを調整してください。", "调整这些参数以丰富分析，而不增加主要临床数据的负担。", "התאימו פרמטרים אלה כדי להעשיר את הניתוח בלי להכביד על הנתונים הקליניים העיקריים."],
[f.cardiovascularRisk, "Cardiovascular risk", "Riesgo cardiovascular", "심혈관 위험", "Nguy cơ tim mạch", "Kardiovaskulær risiko", "心血管リスク", "心血管风险", "סיכון לבבי וכלי דם"],
[f.renalFunction, "Kidney function", "Función renal", "신장 기능", "Chức năng thận", "Nyrefunksjon", "腎機能", "肾功能", "תפקוד כלייתי"],
[f.fragility, "Frailty", "Fragilidad", "노쇠", "Tình trạng suy yếu", "Skrøpelighet", "フレイル", "衰弱", "שבריריות"],
[f.tolerance, "Tolerability", "Tolerabilidad", "내약성", "Khả năng dung nạp", "Toleranse", "忍容性", "耐受性", "סבילות"],
[f.glycemicGoals, "Glycemic goals", "Objetivos glucémicos", "혈당 목표", "Mục tiêu đường huyết", "Blodsukkermål", "血糖管理目標", "血糖控制目标", "יעדי איזון סוכר"],
[f.save, "Save", "Guardar", "저장", "Lưu", "Lagre", "保存", "保存", "שמירה"],
[f.cancel, "Cancel", "Cancelar", "취소", "Hủy", "Avbryt", "キャンセル", "取消", "ביטול"],
[f.diabetesParametersButton, "Type 2 diabetes parameters", "Parámetros de la diabetes tipo 2", "제2형 당뇨병 매개변수", "Thông số đái tháo đường típ 2", "Parametere for type 2-diabetes", "2型糖尿病のパラメータ", "2 型糖尿病参数", "פרמטרים לסוכרת מסוג 2"],
[f.age, "Patient age", "Edad del paciente", "환자 나이", "Tuổi người bệnh", "Pasientens alder", "患者の年齢", "患者年龄", "גיל המטופל"],
[f.male, "Male", "Masculino", "남성", "Nam", "Mann", "男性", "男", "זכר"],
[f.female, "Female", "Femenino", "여성", "Nữ", "Kvinne", "女性", "女", "נקבה"],
[f.clearPatientData, "Clear patient data", "Borrar los datos del paciente", "환자 데이터 지우기", "Xóa dữ liệu người bệnh", "Tøm pasientdata", "患者データを消去", "清除患者数据", "ניקוי נתוני המטופל"],
[f.weight, "Patient weight (kg)", "Peso del paciente (kg)", "환자 체중(kg)", "Cân nặng người bệnh (kg)", "Pasientens vekt (kg)", "患者の体重（kg）", "患者体重（kg）", "משקל המטופל (ק״ג)"],
[f.height, "Patient height (cm)", "Estatura del paciente (cm)", "환자 키(cm)", "Chiều cao người bệnh (cm)", "Pasientens høyde (cm)", "患者の身長（cm）", "患者身高（cm）", "גובה המטופל (ס״מ)"],
[f.diagnosis, "Diagnosis / main clinical reason", "Diagnóstico / motivo clínico principal", "진단 / 주요 임상 사유", "Chẩn đoán / lý do lâm sàng chính", "Diagnose / hovedårsak til vurdering", "診断／主な臨床上の理由", "诊断／主要临床原因", "אבחנה / סיבה קלינית עיקרית"],
[f.symptoms, "Main symptoms", "Síntomas principales", "주요 증상", "Triệu chứng chính", "Hovedsymptomer", "主な症状", "主要症状", "תסמינים עיקריים"],
[f.medicalHistory, "Medical history", "Antecedentes médicos", "병력", "Tiền sử bệnh", "Sykehistorie", "既往歴", "既往病史", "היסטוריה רפואית"],
[f.medications, "Current medications", "Medicación actual", "현재 복용 약물", "Thuốc đang dùng", "Nåværende legemidler", "現在の薬剤", "当前用药", "תרופות נוכחיות"],
[f.diagnosisHelp, "Enter the confirmed diagnosis or main clinical reason, for example: gastric cancer", "Introduzca el diagnóstico confirmado o el motivo clínico principal, por ejemplo: cáncer gástrico", "확진된 진단 또는 주요 임상 사유를 입력하세요. 예: 위암", "Nhập chẩn đoán đã xác nhận hoặc lý do lâm sàng chính, ví dụ: ung thư dạ dày", "Skriv bekreftet diagnose eller hovedårsak til vurdering, for eksempel: magekreft", "確定診断または主な臨床上の理由を入力してください。例：胃がん", "输入已确认的诊断或主要临床原因，例如：胃癌", "הזינו את האבחנה המאומתת או את הסיבה הקלינית העיקרית, לדוגמה: סרטן הקיבה"],
[f.ageHelp, "Enter the patient's age, for example: 55", "Introduzca la edad del paciente, por ejemplo: 55", "환자 나이를 입력하세요. 예: 55", "Nhập tuổi người bệnh, ví dụ: 55", "Skriv pasientens alder, for eksempel: 55", "患者の年齢を入力してください。例：55", "输入患者年龄，例如：55", "הזינו את גיל המטופל, לדוגמה: 55"],
[f.sexHelp, "Select the clinical sex relevant to the analysis", "Seleccione el sexo clínico pertinente para el análisis", "분석에 관련된 임상적 성별을 선택하세요", "Chọn giới tính lâm sàng phù hợp với phân tích", "Velg klinisk kjønn som er relevant for analysen", "解析に関連する臨床上の性別を選択してください", "选择与分析相关的临床性别", "בחרו את המין הקליני הרלוונטי לניתוח"],
[f.weightHelp, "Enter a numeric value, for example: 92", "Introduzca un valor numérico, por ejemplo: 92", "숫자를 입력하세요. 예: 92", "Nhập giá trị số, ví dụ: 92", "Skriv en tallverdi, for eksempel: 92", "数値を入力してください。例：92", "输入数值，例如：92", "הזינו ערך מספרי, לדוגמה: 92"],
[f.heightHelp, "Enter a numeric value, for example: 175", "Introduzca un valor numérico, por ejemplo: 175", "숫자를 입력하세요. 예: 175", "Nhập giá trị số, ví dụ: 175", "Skriv en tallverdi, for eksempel: 175", "数値を入力してください。例：175", "输入数值，例如：175", "הזינו ערך מספרי, לדוגמה: 175"],
[f.symptomsHelp, "Separate each symptom with a comma, for example: fatigue, polydipsia", "Separe cada síntoma con una coma, por ejemplo: fatiga, polidipsia", "각 증상을 쉼표로 구분하세요. 예: 피로, 다음증", "Phân cách từng triệu chứng bằng dấu phẩy, ví dụ: mệt mỏi, khát nhiều", "Skill hvert symptom med komma, for eksempel: tretthet, økt tørste", "症状をカンマで区切ってください。例：疲労、多飲", "用逗号分隔各症状，例如：疲劳，多饮", "הפרידו כל תסמין בפסיק, לדוגמה: עייפות, צמא מוגבר"],
[f.medicalHistoryHelp, "Known conditions or diagnoses, separated by commas", "Enfermedades o diagnósticos conocidos, separados por comas", "알려진 질환 또는 진단을 쉼표로 구분하세요", "Các bệnh hoặc chẩn đoán đã biết, phân cách bằng dấu phẩy", "Kjente tilstander eller diagnoser, atskilt med komma", "既知の疾患や診断をカンマで区切ってください", "已知疾病或诊断，用逗号分隔", "מצבים או אבחנות ידועים, מופרדים בפסיקים"],
[f.medicationsHelp, "Names of current medications, separated by commas", "Nombres de los medicamentos actuales, separados por comas", "현재 복용 중인 약물 이름을 쉼표로 구분하세요", "Tên thuốc đang dùng, phân cách bằng dấu phẩy", "Navn på nåværende legemidler, atskilt med komma", "現在の薬剤名をカンマで区切ってください", "当前药物名称，用逗号分隔", "שמות התרופות הנוכחיות, מופרדים בפסיקים"],
[c.Hypertension, "Hypertension", "Hipertensión", "고혈압", "Tăng huyết áp", "Hypertensjon", "高血圧", "高血压", "יתר לחץ דם"],
[c["Gastric cancer"], "Gastric cancer", "Cáncer gástrico", "위암", "Ung thư dạ dày", "Magekreft", "胃がん", "胃癌", "סרטן הקיבה"],
[c["Infectious mononucleosis"], "Infectious mononucleosis", "Mononucleosis infecciosa", "전염성 단핵구증", "Tăng bạch cầu đơn nhân nhiễm khuẩn", "Infeksiøs mononukleose", "伝染性単核球症", "传染性单核细胞增多症", "מחלת הנשיקה"],
[c.Cataract, "Cataract", "Catarata", "백내장", "Đục thủy tinh thể", "Grå stær", "白内障", "白内障", "קטרקט"],
[c["Major depressive disorder"], "Major depressive disorder", "Trastorno depresivo mayor", "주요 우울 장애", "Rối loạn trầm cảm chủ yếu", "Alvorlig depressiv lidelse", "大うつ病性障害", "重度抑郁障碍", "הפרעת דיכאון מז׳ורי"],
[c["Type 2 diabetes"], "Type 2 diabetes", "Diabetes tipo 2", "제2형 당뇨병", "Đái tháo đường típ 2", "Diabetes type 2", "2型糖尿病", "2型糖尿病", "סוכרת מסוג 2"],
[c.Dyslipidemia, "Dyslipidemia", "Dislipidemia", "이상지질혈증", "Rối loạn lipid máu", "Dyslipidemi", "脂質異常症", "血脂异常", "הפרעה בשומני הדם"],
[c.Anemia, "Anemia", "Anemia", "빈혈", "Thiếu máu", "Anemi", "貧血", "贫血", "אנמיה"],
[c["Generalized anxiety"], "Generalized anxiety", "Ansiedad generalizada", "범불안", "Lo âu lan tỏa", "Generalisert angst", "全般性不安", "广泛性焦虑", "חרדה כללית"],
[c.None, "None", "Ninguno", "없음", "Không có", "Ingen", "なし", "无", "אין"],
[s.Headache, "Headache", "Cefalea", "두통", "Đau đầu", "Hodepine", "頭痛", "头痛", "כאב ראש"],
[s["Elevated blood pressure"], "Elevated blood pressure", "Presión arterial elevada", "혈압 상승", "Huyết áp tăng", "Forhøyet blodtrykk", "血圧上昇", "血压升高", "לחץ דם מוגבר"],
[s["Epigastric pain"], "Epigastric pain", "Dolor epigástrico", "명치 통증", "Đau thượng vị", "Smerter i epigastriet", "心窩部痛", "上腹部疼痛", "כאב ברום הבטן"],
[s["Weight loss"], "Weight loss", "Pérdida de peso", "체중 감소", "Sụt cân", "Vekttap", "体重減少", "体重下降", "ירידה במשקל"],
[s.Nausea, "Nausea", "Náuseas", "메스꺼움", "Buồn nôn", "Kvalme", "吐き気", "恶心", "בחילה"],
[s["Severe fatigue"], "Severe fatigue", "Fatiga intensa", "심한 피로", "Mệt mỏi nặng", "Alvorlig tretthet", "強い疲労", "严重疲劳", "עייפות קשה"],
[s.Fever, "Fever", "Fiebre", "발열", "Sốt", "Feber", "発熱", "发热", "חום"],
[s["Cervical lymphadenopathy"], "Cervical lymphadenopathy", "Adenopatías cervicales", "경부 림프절병증", "Hạch cổ to", "Cervikal lymfadenopati", "頸部リンパ節腫大", "颈部淋巴结肿大", "הגדלת קשרי לימפה בצוואר"],
[s["Progressive blurred vision"], "Progressive blurred vision", "Visión borrosa progresiva", "점진적인 시야 흐림", "Nhìn mờ tăng dần", "Tiltakende tåkesyn", "進行するかすみ目", "渐进性视物模糊", "טשטוש ראייה מתקדם"],
[s.Glare, "Glare", "Deslumbramiento", "눈부심", "Chói mắt", "Blending", "まぶしさ", "眩光", "סנוור"],
[s["Reduced visual acuity"], "Reduced visual acuity", "Disminución de la agudeza visual", "시력 저하", "Giảm thị lực", "Redusert synsskarphet", "視力低下", "视力下降", "ירידה בחדות הראייה"],
[s["Depressed mood"], "Depressed mood", "Ánimo deprimido", "우울한 기분", "Khí sắc trầm buồn", "Nedstemthet", "抑うつ気分", "情绪低落", "מצב רוח ירוד"],
[s.Insomnia, "Insomnia", "Insomnio", "불면증", "Mất ngủ", "Søvnløshet", "不眠", "失眠", "נדודי שינה"],
[s["Loss of interest"], "Loss of interest", "Pérdida de interés", "흥미 상실", "Mất hứng thú", "Tap av interesse", "興味の喪失", "兴趣丧失", "אובדן עניין"],
[s.Fatigue, "Fatigue", "Fatiga", "피로", "Mệt mỏi", "Tretthet", "疲労", "疲劳", "עייפות"],
[s.Polydipsia, "Polydipsia", "Polidipsia", "다음증", "Khát nhiều", "Økt tørste", "多飲", "多饮", "צמא מוגבר"],
[s.Polyuria, "Polyuria", "Poliuria", "다뇨증", "Tiểu nhiều", "Polyuri", "多尿", "多尿", "השתנה מרובה"],
[s["Persistent hyperglycemia"], "Persistent hyperglycemia", "Hiperglucemia persistente", "지속적인 고혈당", "Tăng đường huyết kéo dài", "Vedvarende hyperglykemi", "持続する高血糖", "持续高血糖", "רמת סוכר גבוהה מתמשכת"],
[s["Progressive weight gain"], "Progressive weight gain", "Aumento progresivo de peso", "점진적인 체중 증가", "Tăng cân dần", "Tiltakende vektøkning", "進行する体重増加", "体重逐渐增加", "עלייה מתמשכת במשקל"],
[s["Urinary retention"], "Urinary retention", "Retención urinaria", "요폐", "Bí tiểu", "Urinretensjon", "尿閉", "尿潴留", "אצירת שתן"],
];

export function localizeClinicalFormFieldLabel(source: string, locale: string): string | null {
    const index = languages.indexOf(baseUiLocale(locale));
    return index < 0 ? null : clinicalFormFieldRows.find(row => row[0] === source)?.[index] ?? null;
}

export function exampleConceptSource(term: string): string | null {
    return (c as Record<string, string>)[term] ?? (s as Record<string, string>)[term] ?? null;
}
