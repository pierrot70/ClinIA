import { describe, expect, it } from "vitest";

import { getClinicalFormReviewedStrings } from "./clinicalFormStrings";

describe("reviewed clinical form strings", () => {
  it.each([
    ["fr-CA", "Définir les paramètres cliniques de l'analyse"],
    ["en-CA", "Define the clinical parameters for the analysis"],
    ["es", "Definir los parámetros clínicos del análisis"],
    ["ja", "解析用の臨床パラメータを設定"],
    ["zh", "定义分析所需的临床参数"],
    ["he", "הגדרת הפרמטרים הקליניים לניתוח"],
    ["ko-KR", "분석을 위한 임상 매개변수 정의"],
    ["vi", "Xác định các thông số lâm sàng cho phân tích"],
    ["no-NO", "Definer kliniske parametere for analysen"],
  ])("returns reviewed strings for %s", (locale, expectedTitle) => {
    expect(getClinicalFormReviewedStrings(locale).clinicalParametersTitle).toBe(
      expectedTitle
    );
  });

  it("falls back to English for an unsupported locale", () => {
    expect(getClinicalFormReviewedStrings("de-DE").agePlaceholder).toBe(
      "Example: 55"
    );
  });
});
