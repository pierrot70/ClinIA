import { describe, expect, it } from "vitest";

import { getClinicalResultStrings } from "./clinicalResultStrings";

describe("getClinicalResultStrings", () => {
  it("provides reviewed Spanish result titles", () => {
    const strings = getClinicalResultStrings("es");

    expect(strings.summaryTitle).toBe("Resumen clínico del paciente");
    expect(strings.recommendationsTitle).toBe("Alternativas y recomendaciones");
    expect(strings.questionsTitle).toBe("Preguntas clínicas para explorar");
  });

  it("uses the base locale and falls back to French", () => {
    expect(getClinicalResultStrings("es-MX").aiClinicalSummary).toBe(
      "Resumen clínico de IA"
    );
    expect(getClinicalResultStrings("de-DE").summaryTitle).toBe(
      "Résumé clinique du patient"
    );
  });

  it.each([
    ["fr", "Résumé clinique du patient"],
    ["en-CA", "Patient clinical summary"],
    ["es", "Resumen clínico del paciente"],
    ["ja", "患者の臨床サマリー"],
    ["zh", "患者临床摘要"],
    ["he", "סיכום קליני של המטופל"],
    ["ko-KR", "환자 임상 요약"],
    ["vi", "Tóm tắt lâm sàng của bệnh nhân"],
    ["no-NO", "Klinisk pasientsammendrag"],
  ])("provides a reviewed summary title for %s", (locale, expected) => {
    expect(getClinicalResultStrings(locale).summaryTitle).toBe(expected);
  });

  it.each([
    ["fr", "Retour à"],
    ["en-CA", "Back to"],
    ["es", "Volver a"],
    ["ja", "戻る"],
    ["zh", "返回"],
    ["he", "חזרה אל"],
    ["ko-KR", "돌아가기"],
    ["vi", "Quay lại"],
    ["no-NO", "Tilbake til"],
  ])("provides a translated return command for %s", (locale, expected) => {
    const label = `${getClinicalResultStrings(locale).backToClinicalDemo} /clinical-demo`;

    expect(label).toBe(`${expected} /clinical-demo`);
    expect(label).toContain("/clinical-demo");
  });
});
