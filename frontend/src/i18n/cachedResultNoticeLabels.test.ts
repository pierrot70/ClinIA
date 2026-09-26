import { describe, expect, it } from "vitest";
import { getCachedResultNoticeLabels } from "./cachedResultNoticeLabels";
import { UI_LABELS_FR } from "./uiLabels.fr";

describe("cached result notice labels", () => {
  it.each([
    ["fr", "Consulter le résultat"], ["en", "View result"],
    ["es", "Ver resultado"], ["vi", "Xem kết quả"], ["no", "Vis resultat"],
    ["ja", "結果を見る"], ["zh", "查看结果"], ["he", "הצגת התוצאה"], ["ko", "결과 보기"],
  ])("provides complete versioned labels for %s", (locale, action) => {
    const labels = getCachedResultNoticeLabels(locale);
    expect(labels.viewResultAction).toBe(action);
    expect(Object.keys(labels).sort()).toEqual(Object.keys(UI_LABELS_FR.clinicalDemo.cachedResultNotice).sort());
    Object.values(labels).forEach(value => expect(value.trim()).not.toBe(""));
    expect(getCachedResultNoticeLabels(`${locale}-CA`)).toEqual(labels);
  });

  it("uses the French source for unsupported locales", () => {
    expect(getCachedResultNoticeLabels("unknown")).toBe(UI_LABELS_FR.clinicalDemo.cachedResultNotice);
  });
});
