import { UI_LABELS_FR } from "./uiLabels.fr";
import { baseUiLocale } from "./uiLocales";
const translations: Record<string, { unknown: string; reused: string }> = {
    en: { unknown: "Provenance not provided", reused: "Response reused from the cache." },
    es: { unknown: "Procedencia no indicada", reused: "Respuesta reutilizada de la caché." },
    ko: { unknown: "출처 정보 없음", reused: "캐시에서 재사용한 응답입니다." },
    vi: { unknown: "Chưa cung cấp nguồn gốc", reused: "Phản hồi được sử dụng lại từ bộ nhớ đệm." },
    no: { unknown: "Opprinnelse ikke oppgitt", reused: "Svar gjenbrukt fra hurtigbufferen." },
    ja: { unknown: "出所の記載なし", reused: "キャッシュから再利用された回答です。" },
    zh: { unknown: "未提供来源", reused: "此回答从缓存中复用。" },
    he: { unknown: "המקור לא צוין", reused: "תשובה שנעשה בה שימוש חוזר מהמטמון." },
};
export function clinicalProvenanceLabels(locale: string) {
    return translations[baseUiLocale(locale)] ?? UI_LABELS_FR.clinicalProvenance;
}
