import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeI18nContext } from "../../contexts/HomeI18nContext";
import { UI_LABELS_FR } from "../../i18n/uiLabels.fr";
import { UI_LOCALES } from "../../i18n/uiLocales";
import { getLocalUiTranslation } from "../../i18n/localUiTranslations";
import { UiMessage } from "./UiMessage";

function Message({ locale, message }: { locale: string; message: string }) {
    return <HomeI18nContext.Provider value={{ locale } as any}>
        <p role="alert"><UiMessage message={message} /></p>
    </HomeI18nContext.Provider>;
}

describe("localized server message rendering", () => {
    it.each(UI_LOCALES)("updates an existing credential error to %s", locale => {
        const message = UI_LABELS_FR.loginPage.errors.invalidCredentials;
        const { rerender } = render(<Message locale="fr-CA" message={message} />);
        expect(screen.getByRole("alert")).toHaveTextContent(message);
        rerender(<Message locale={locale} message={message} />);
        expect(screen.getByRole("alert").textContent).toBe(getLocalUiTranslation(message, locale));
    });

    it.each(UI_LOCALES)("uses a fixed localized fallback for unknown prose in %s", locale => {
        const message = "Unregistered server error with synthetic reference 9876";
        render(<Message locale={locale} message={message} />);
        expect(screen.getByRole("alert").textContent).toBe(getLocalUiTranslation(UI_LABELS_FR.generalUi.error, locale));
        expect(screen.queryByText(message)).not.toBeInTheDocument();
    });

    it("keeps values intact in a known message template", () => {
        render(<Message locale="en-CA" message={UI_LABELS_FR.emailQuota.remaining.replace("{remaining}", "146")} />);
        expect(screen.getByRole("alert")).toHaveTextContent("146 attempts remaining");
    });
});
