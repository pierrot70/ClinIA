import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeI18nContext } from "../../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../../i18n/homeStrings";
import { COMPONENT_UI_TRANSLATIONS } from "../../i18n/componentUiLabels";
import AICard from "../AICard";
import { DiagnosticHeader } from "../clinical/DiagnosticHeader";
import { AlternativesPanel } from "../clinical/AlternativesPanel";
import { RedFlagsPanel } from "../clinical/RedFlagsPanel";

function CommonUi({ locale }: { locale: string }) {
    return <HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR, isTranslating: false, setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}>
        <AICard loading error={false} />
        <DiagnosticHeader diagnosis="Synthetic diagnosis, unchanged" certainty="high" justification="Synthetic clinical detail, unchanged" />
        <AlternativesPanel alternatives={[{ name: "Synthetic option, unchanged", reason: "Synthetic narrative, unchanged" }]} />
        <RedFlagsPanel flags={["Synthetic warning, unchanged"]} />
    </HomeI18nContext.Provider>;
}
afterEach(cleanup);

describe("common UI follows the global locale", () => {
    it.each(["en", "es", "ko", "vi", "no", "ja", "zh", "he"])("updates static labels on switch to %s and keeps clinical data intact", locale => {
        const { rerender } = render(<CommonUi locale="fr" />);
        expect(screen.getByText("Analyse en cours...")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Voir les alternatives" }));
        rerender(<CommonUi locale={locale} />);
        const translated = COMPONENT_UI_TRANSLATIONS[locale];
        expect(screen.getByText(translated.analyseEnCours)).toBeInTheDocument();
        expect(screen.getByText(translated.diagnosticSuspecte)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: translated.masquerLesAlternatives })).toBeInTheDocument();
        expect(screen.getByText("Synthetic diagnosis, unchanged")).toBeInTheDocument();
        expect(screen.getByText("Synthetic clinical detail, unchanged")).toBeInTheDocument();
        expect(screen.getByText("Synthetic option, unchanged")).toBeInTheDocument();
        expect(screen.getByText("Synthetic narrative, unchanged")).toBeInTheDocument();
        expect(screen.getByText("Synthetic warning, unchanged")).toBeInTheDocument();
    });
});
