import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { UI_LABELS_FR as labels } from "../i18n/uiLabels.fr";
import { UI_LOCALES } from "../i18n/uiLocales";
import { getLocalUiTranslation } from "../i18n/localUiTranslations";
import { useSensitiveReauthDialog } from "./useSensitiveReauthDialog";

const reauthenticate = vi.hoisted(() => vi.fn());
vi.mock("./useAuth", () => ({ useAuth: () => ({
    reauthenticate, user: { email: "admin@synthetic.test", role: "SUPERADMIN" },
}) }));

function Dialog({ locale }: { locale: string }) {
    return <HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR, isTranslating: false,
        setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}><Probe /></HomeI18nContext.Provider>;
}
function Probe() {
    const { requestSensitiveReauth, sensitiveReauthModal } = useSensitiveReauthDialog();
    return <><button onClick={() => void requestSensitiveReauth()}>Open test dialog</button>{sensitiveReauthModal}</>;
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe("sensitive confirmation follows the language selector", () => {
    it.each(UI_LOCALES)("updates the open dialogue to %s without clearing the password", locale => {
        const { rerender } = render(<Dialog locale="fr-CA" />);
        fireEvent.click(screen.getByText("Open test dialog"));
        fireEvent.change(screen.getByLabelText(labels.auth.sensitiveAction.passwordLabel), { target: { value: "synthetic password" } });
        rerender(<Dialog locale={locale} />);
        const copy = labels.auth.sensitiveAction;
        expect(screen.getByRole("heading", { name: getLocalUiTranslation(copy.title, locale)! })).toBeInTheDocument();
        expect(screen.getByLabelText(getLocalUiTranslation(copy.passwordLabel, locale)!)).toHaveValue("synthetic password");
        expect(screen.getByText(getLocalUiTranslation(copy.helper, locale)!)).toBeInTheDocument();
        expect(screen.getByText(/admin@synthetic.test/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: getLocalUiTranslation(copy.cancel, locale)! }));
        expect(reauthenticate).not.toHaveBeenCalled();
        expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    });

    it("retranslates an existing confirmation error when the language changes", async () => {
        reauthenticate.mockRejectedValue(new Error(labels.auth.sensitiveAction.invalidPassword));
        const { rerender } = render(<Dialog locale="fr-CA" />);
        fireEvent.click(screen.getByText("Open test dialog"));
        fireEvent.change(screen.getByLabelText(labels.auth.sensitiveAction.passwordLabel), { target: { value: "synthetic password" } });
        fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));
        await screen.findByText(labels.auth.sensitiveAction.invalidPassword);
        rerender(<Dialog locale="en-CA" />);
        await waitFor(() => expect(screen.getByText(getLocalUiTranslation(labels.auth.sensitiveAction.invalidPassword, "en-CA")!)).toBeInTheDocument());
        expect(reauthenticate).toHaveBeenCalledExactlyOnceWith("synthetic password");
    });
});
