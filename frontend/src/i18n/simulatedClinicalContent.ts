import { hypertensionTreatments } from "../data/hypertension";
import { baseUiLocale } from "./uiLocales";

// Exact versioned simulation content only; arbitrary clinical API text is
// never sent to a translation service or substituted with generic advice.
const languages = ["fr", "en", "es", "ko", "vi", "no", "ja", "zh", "he"];
export const simulatedClinicalRows: readonly (readonly string[])[] = [
  ["Aucun mock spécifique trouvé. Exemple générique.",
    "No specific simulation found. Generic example.",
    "No se encontró una simulación específica. Ejemplo genérico.",
    "해당하는 시뮬레이션을 찾지 못했습니다. 일반 예시입니다.",
    "Không tìm thấy mô phỏng cụ thể. Ví dụ chung.",
    "Ingen spesifikk simulering funnet. Generelt eksempel.",
    "該当するシミュレーションが見つかりませんでした。一般的な例です。",
    "未找到对应的模拟。以下为通用示例。",
    "לא נמצאה סימולציה ספציפית. דוגמה כללית."],
  ["Aucun mock spécifique trouvé.",
    "No specific simulation found.", "No se encontró una simulación específica.",
    "해당하는 시뮬레이션을 찾지 못했습니다.", "Không tìm thấy mô phỏng cụ thể.",
    "Ingen spesifikk simulering funnet.", "該当するシミュレーションが見つかりませんでした。",
    "未找到对应的模拟。", "לא נמצאה סימולציה ספציפית."],
  ["Aucun mock spécifique trouvé, mais voici un exemple générique.",
    "No specific simulation found, but here is a generic example.",
    "No se encontró una simulación específica, pero aquí hay un ejemplo genérico.",
    "해당하는 시뮬레이션을 찾지 못했지만 일반 예시를 제공합니다.",
    "Không tìm thấy mô phỏng cụ thể, nhưng đây là một ví dụ chung.",
    "Ingen spesifikk simulering funnet, men her er et generelt eksempel.",
    "該当するシミュレーションが見つかりませんでしたが、一般的な例を示します。",
    "未找到对应的模拟，但这里提供一个通用示例。",
    "לא נמצאה סימולציה ספציפית, אך הנה דוגמה כללית."],
  [hypertensionTreatments[0].summary,
    "First-line agent with very good blood pressure control and a generally favorable side-effect profile.",
    "Agente de primera línea con un muy buen control de la presión arterial y un perfil de efectos secundarios generalmente favorable.",
    "혈압 조절 효과가 매우 좋고 부작용 양상이 대체로 양호한 일차 치료 약제입니다.",
    "Thuốc điều trị hàng đầu giúp kiểm soát huyết áp rất tốt và có đặc điểm tác dụng phụ nhìn chung thuận lợi.",
    "Førstelinjemiddel med svært god blodtrykkskontroll og en generelt gunstig bivirkningsprofil.",
    "血圧コントロールが非常に良好で、副作用の傾向も概ね良好な第一選択薬です。",
    "一线药物，血压控制效果很好，副作用情况总体较为良好。",
    "תרופה לקו ראשון עם שליטה טובה מאוד בלחץ הדם ופרופיל תופעות לוואי חיובי בדרך כלל."],
  [hypertensionTreatments[1].summary,
    "Well tolerated, particularly useful in patients with stable angina or coronary artery disease.",
    "Bien tolerada, especialmente útil en pacientes con angina estable o enfermedad coronaria.",
    "내약성이 좋으며 안정형 협심증이나 관상동맥질환이 있는 환자에게 특히 유용합니다.",
    "Dung nạp tốt, đặc biệt hữu ích ở người bệnh đau thắt ngực ổn định hoặc bệnh động mạch vành.",
    "Godt tolerert, særlig nyttig hos pasienter med stabil angina eller koronarsykdom.",
    "忍容性が良好で、安定狭心症や冠動脈疾患のある患者に特に有用です。",
    "耐受性良好，对稳定型心绞痛或冠状动脉疾病患者尤其有用。",
    "נסבלת היטב, שימושית במיוחד למטופלים עם תעוקת חזה יציבה או מחלת עורקים כליליים."],
  [hypertensionTreatments[2].summary,
    "Preferred option in diabetes or nephropathy, with a favorable renal-protection profile (simulated data).",
    "Opción preferida en caso de diabetes o nefropatía, con un buen perfil de protección renal (datos simulados).",
    "당뇨병이나 신장병증이 있을 때 선호되는 선택지이며 신장 보호 측면에서 양호한 특성을 보입니다(모의 데이터).",
    "Lựa chọn được ưu tiên khi có đái tháo đường hoặc bệnh thận, với đặc điểm bảo vệ thận thuận lợi (dữ liệu mô phỏng).",
    "Foretrukket alternativ ved diabetes eller nefropati, med en gunstig nyrebeskyttende profil (simulerte data).",
    "糖尿病や腎症の場合に優先される選択肢で、腎保護の観点から良好な特性を持ちます（模擬データ）。",
    "糖尿病或肾病情况下优先考虑的方案，具有良好的肾脏保护特征（模拟数据）。",
    "אפשרות מועדפת בסוכרת או בנפרופתיה, עם פרופיל חיובי של הגנה על הכליות (נתונים מדומים)."],
];

export function getSimulatedClinicalContent(text: string, locale: string): string | null {
  const column = languages.indexOf(baseUiLocale(locale));
  if (column < 0) return null;
  const row = simulatedClinicalRows.find(entry => entry[0] === text);
  return row?.[column] ?? null;
}
