import { describe, expect, it, vi } from "vitest";
import { UI_LABELS_FR } from "./uiLabels.fr";
import { UI_LOCALES, validUiTranslation } from "./uiLocales";
import { formatVoiceUiStatus, localizeVoiceUiLabel } from "./voiceUiLabels";

describe("voice interface catalog", () => {
  it.each(UI_LOCALES)("covers every voice status and preserves tokens in %s", locale => {
    for (const source of Object.values(UI_LABELS_FR.header.voice.feedback)) {
      expect(validUiTranslation(source, localizeVoiceUiLabel(source, locale)), source).toBe(true);
    }
  });
  it("never translates captured speech or technical error codes", () => {
    const translate = vi.fn((source: string) => localizeVoiceUiLabel(source, "en-CA") ?? source);
    const speech = 'synthetic transcript {label} <b>opaque data</b>';
    expect(formatVoiceUiStatus(UI_LABELS_FR.header.voice.feedback.heard, translate, { text: speech })).toBe(`Heard: "${speech}"`);
    expect(translate).not.toHaveBeenCalledWith(speech);
    expect(formatVoiceUiStatus(UI_LABELS_FR.header.voice.feedback.voiceError, translate, { error: "NotAllowedError" })).toBe("Voice error: NotAllowedError");
    expect(translate).not.toHaveBeenCalledWith("NotAllowedError");
  });
});
