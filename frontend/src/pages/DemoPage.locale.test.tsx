import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { PAGE_UI_TRANSLATIONS } from "../i18n/pageUiLabels";
import DemoPage from "./DemoPage";

function Demo({ locale }: { locale: string }) {
    return <HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR, isTranslating: false,
        setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}>
        <MemoryRouter><DemoPage /></MemoryRouter>
    </HomeI18nContext.Provider>;
}
afterEach(cleanup);
describe("demo guide local UI", () => {
    it.each(["en", "es", "ko", "vi", "no", "ja", "zh", "he"])("changes all guide sections to %s using local sources", locale => {
        const { rerender } = render(<Demo locale="fr-CA" />);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Démonstration ClinIA en moins de 5 minutes");
        rerender(<Demo locale={locale} />);
        const dictionary = PAGE_UI_TRANSLATIONS[locale];
        for (const [key, value] of Object.entries(dictionary)) {
            if (key.startsWith("demo")) expect(screen.getByText(value)).toBeInTheDocument();
        }
        expect(screen.getByText("00:00 - 00:45")).toBeInTheDocument();
    });
});
