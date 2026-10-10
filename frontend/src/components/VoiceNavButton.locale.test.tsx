import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { UI_LOCALES } from "../i18n/uiLocales";
import { localizeHeaderUiLabel } from "../i18n/headerUiLabels";
import VoiceNavButton from "./VoiceNavButton";

function Page({ locale }: { locale: string }) {
  return <MemoryRouter><HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR,
    isTranslating: false, setLocaleFromDropdown: vi.fn(async () => {}),
    setLocaleFromVoice: vi.fn(async () => ({ voiceAck: "", dictationInstruction: "" })) }}>
    <VoiceNavButton />
  </HomeI18nContext.Provider></MemoryRouter>;
}
describe("voice control interface locale", () => {
  afterEach(() => { cleanup(); localStorage.clear(); });
  it.each(UI_LOCALES)("updates existing microphone errors and accessible labels in %s", locale => {
    const { rerender } = render(<Page locale="fr-CA" />);
    fireEvent.click(screen.getByRole("button", { name: UI_LABELS_FR.header.voice.activateVoiceMode }));
    expect(screen.getByText(UI_LABELS_FR.header.voice.feedback.unsupported)).toBeInTheDocument();
    rerender(<Page locale={locale} />);
    const button = screen.getByRole("button", { name: localizeHeaderUiLabel(UI_LABELS_FR.header.voice.activateVoiceMode, locale)! });
    expect(button).toHaveAttribute("title", localizeHeaderUiLabel(UI_LABELS_FR.header.voice.feedback.tooltip, locale)!);
    expect(screen.getByText(localizeHeaderUiLabel(UI_LABELS_FR.header.voice.feedback.unsupported, locale)!)).toBeInTheDocument();
  });
});
