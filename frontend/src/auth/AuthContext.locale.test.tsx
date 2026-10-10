import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuthContext } from "./AuthContext";
import { HomeI18nProvider, useHomeI18n } from "../contexts/HomeI18nContext";
import { UI_LABELS_FR as labels } from "../i18n/uiLabels.fr";
import { UI_LOCALES } from "../i18n/uiLocales";
import { getLocalUiTranslation } from "../i18n/localUiTranslations";

const service = vi.hoisted(() => ({ bootstrapSession: vi.fn(), getUser: vi.fn(), hasActiveSession: vi.fn(),
    getValidAccessToken: vi.fn(), authFetch: vi.fn(), logout: vi.fn(), login: vi.fn(), completeMfaLogin: vi.fn(),
    reauthenticate: vi.fn(), registerSelf: vi.fn(), refreshAccessToken: vi.fn() }));
vi.mock("../services/authService", () => service);

function Probe() {
    const { status } = useAuthContext();
    const { setLocaleFromDropdown } = useHomeI18n();
    return <><output data-testid="status">{status}</output>{UI_LOCALES.map(locale =>
        <button key={locale} onClick={() => void setLocaleFromDropdown(locale)}>{locale}</button>
    )}</>;
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.clear();
    localStorage.setItem("clinia_ui_locale_v3", "fr-CA");
    const user = { id: "synthetic-admin", email: "admin@synthetic.test", role: "SUPERADMIN" };
    service.bootstrapSession.mockResolvedValue({ user, accessToken: "synthetic-token" });
    service.getUser.mockReturnValue(user);
    service.hasActiveSession.mockReturnValue(true);
    service.getValidAccessToken.mockResolvedValue("synthetic-token");
    service.authFetch.mockResolvedValue({});
    service.logout.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("session warning inside the language provider", () => {
    it("updates the existing countdown across all languages and keeps the session active", async () => {
        render(<HomeI18nProvider><AuthProvider><Probe /></AuthProvider></HomeI18nProvider>);
        await act(async () => {});
        expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
        await act(async () => { vi.advanceTimersByTime(4 * 60 * 1000); });
        expect(screen.getByRole("heading", { name: labels.auth.session.warningTitle })).toBeInTheDocument();
        for (const locale of UI_LOCALES) {
            await act(async () => { fireEvent.click(screen.getByRole("button", { name: locale })); });
            const copy = labels.auth.session;
            expect(screen.getByRole("heading", { name: getLocalUiTranslation(copy.warningTitle, locale)! })).toBeInTheDocument();
            expect(screen.getByText(getLocalUiTranslation(copy.warningBody, locale)!)).toBeInTheDocument();
            expect(screen.getByRole("button", { name: getLocalUiTranslation(copy.warningContinue, locale)! })).toBeInTheDocument();
            expect(screen.getByText("60s")).toBeInTheDocument();
        }
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: getLocalUiTranslation(labels.auth.session.warningContinue, "he")! })); });
        expect(screen.queryByRole("heading")).not.toBeInTheDocument();
        expect(service.logout).not.toHaveBeenCalled();
        expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    });
});
