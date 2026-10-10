import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { UI_LOCALES } from "../i18n/uiLocales";
import { localizeHeaderUiLabel } from "../i18n/headerUiLabels";
import Header from "./Header";

const state = vi.hoisted(() => ({ authenticated: false, fetch: vi.fn() }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({
  isAuthenticated: state.authenticated,
  user: state.authenticated ? { role: "SUPERADMIN", username: "synthetic-admin" } : null,
  logout: vi.fn(async () => {}), authFetch: state.fetch,
}) }));
vi.mock("../hooks/useSensitiveReauthDialog", () => ({ useSensitiveReauthDialog: () => ({ requestSensitiveReauth: vi.fn(async () => false), sensitiveReauthModal: null }) }));
vi.mock("./VoiceNavButton", () => ({ default: () => null }));

function Page({ locale }: { locale: string }) {
  return <MemoryRouter initialEntries={["/login"]}>
    <HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR, isTranslating: false,
      setLocaleFromDropdown: vi.fn(async () => {}), setLocaleFromVoice: vi.fn(async () => ({ voiceAck: "", dictationInstruction: "" })) }}>
      <Header />
    </HomeI18nContext.Provider>
  </MemoryRouter>;
}
describe("header follows selected locale", () => {
  afterEach(() => { cleanup(); localStorage.clear(); state.fetch.mockReset(); });
  it.each(UI_LOCALES)("updates accessible navigation and language selectors in %s", locale => {
    state.authenticated = false;
    const { rerender } = render(<Page locale="fr-CA" />);
    rerender(<Page locale={locale} />);
    const language = localizeHeaderUiLabel(UI_LABELS_FR.header.controls.language, locale)!;
    const openMenu = localizeHeaderUiLabel(UI_LABELS_FR.header.controls.openMenu, locale)!;
    const login = localizeHeaderUiLabel(UI_LABELS_FR.header.nav.login, locale)!;
    const selectors = screen.getAllByRole("combobox", { name: language });
    expect(selectors).toHaveLength(2);
    selectors.forEach(select => expect(select).toHaveValue(locale));
    expect(selectors[0]).toHaveClass("w-56", "max-w-full");
    expect(screen.getAllByRole("link", { name: login }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: openMenu }));
    const search = localizeHeaderUiLabel(UI_LABELS_FR.header.controls.searchMenu, locale)!;
    expect(screen.getByPlaceholderText(search)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: localizeHeaderUiLabel(UI_LABELS_FR.header.controls.close, locale)! })).toBeInTheDocument();
    expect(state.fetch).not.toHaveBeenCalled();
  });
});
