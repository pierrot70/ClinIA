import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeI18nContext } from "../../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../../i18n/homeStrings";
import { UI_LABELS_FR as labels } from "../../i18n/uiLabels.fr";
import { UI_LOCALES } from "../../i18n/uiLocales";
import { getLocalUiMessage, getLocalUiTranslation } from "../../i18n/localUiTranslations";
import type { SecurityIncidentBlockingData } from "../../types/api";
import { SecurityBlockingAlert } from "./SecurityBlockingAlert";

const incident: SecurityIncidentBlockingData = {
    required: true, userMessage: labels.securityBlocking.identifyingContent,
    incident: { id: "synthetic-incident", type: "NON_SECURE_PRE_CLOUD", reason: "SYNTHETIC_REASON", phase: "PRE_CLOUD",
        timestamp: "2026-10-10T12:00:00Z", context: {}, matches: [] },
    acknowledgment: { requiredAction: "J'ai lu et compris", method: "POST", endpoint: "/synthetic/acknowledgment" },
};
afterEach(cleanup);
describe("security messages remain informative in the selected language", () => {
    it.each(UI_LOCALES)("translates the server explanation, action and failure to %s", locale => {
        const acknowledge = vi.fn();
        const page = (language: string, message = incident.userMessage) => <HomeI18nContext.Provider value={{
            locale: language, strings: HOME_STRINGS_FR, isTranslating: false, setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn(),
        }}><SecurityBlockingAlert blocking={{ ...incident, userMessage: message }}
            actionableMessage={labels.securityBlocking.acknowledgmentFailed} acknowledging={false} onAcknowledge={acknowledge} />
        </HomeI18nContext.Provider>;
        const { rerender } = render(page("fr-CA"));
        rerender(page(locale));
        expect(screen.getByText(getLocalUiTranslation(incident.userMessage, locale)!)).toBeInTheDocument();
        expect(screen.getByText(getLocalUiTranslation(labels.securityBlocking.acknowledgmentFailed, locale)!)).toBeInTheDocument();
        expect(screen.getByText("synthetic-incident")).toBeInTheDocument();
        expect(screen.getByText("SYNTHETIC_REASON")).toBeInTheDocument();
        expect(acknowledge).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: getLocalUiTranslation(labels.componentUi.jAiLuEtCompris, locale)! }));
        expect(acknowledge).toHaveBeenCalledTimes(1);
        rerender(page(locale, "Texte serveur synthétique inconnu"));
        expect(screen.getByRole("alertdialog")).toHaveAccessibleDescription(
            getLocalUiTranslation(labels.componentUi.cetteActionEstObligatoirePourReprendreLeWorkflow, locale)!
        );
        expect(screen.queryByText("Texte serveur synthétique inconnu")).not.toBeInTheDocument();
    });

    it.each(UI_LOCALES)("keeps every acknowledgment and retry message local in %s", locale => {
        for (const source of Object.values(labels.securityBlocking)) {
            const message = getLocalUiMessage(source, locale);
            expect(message).toBeTruthy();
            if (locale !== "fr-CA") expect(message).not.toBe(source);
        }
    });
});
