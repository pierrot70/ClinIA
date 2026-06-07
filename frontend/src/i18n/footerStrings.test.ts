import { describe, expect, it } from "vitest";

import { getFooterStrings } from "./footerStrings";

describe("footer strings", () => {
  it.each([
    ["fr-CA", "Compilation"],
    ["en-CA", "Build"],
    ["es", "Compilación"],
    ["ja", "ビルド"],
    ["zh", "构建"],
    ["he", "בנייה"],
    ["ko-KR", "빌드"],
    ["vi", "Bản dựng"],
    ["no-NO", "Bygg"],
  ])("returns reviewed translations for %s", (locale, expectedBuildPrefix) => {
    expect(getFooterStrings(locale).buildPrefix).toBe(expectedBuildPrefix);
  });

  it("falls back to English for an unsupported locale", () => {
    expect(getFooterStrings("de-DE").buildPrefix).toBe("Build");
  });
});
