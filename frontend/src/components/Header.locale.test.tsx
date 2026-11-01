import { clinicalCareAccessLabels } from "../i18n/clinicalCareAccessLabels";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { UI_LOCALES } from "../i18n/uiLocales";
import { localizeHeaderUiLabel } from "../i18n/headerUiLabels";
import Header from "./Header";
import type { UserRole } from "../auth/roles";

const state = vi.hoisted(() => ({ authenticated: false, role: "SUPERADMIN" as UserRole, fetch: vi.fn() }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({
  isAuthenticated: state.authenticated,
  user: state.authenticated ? { role: state.role, username: "synthetic-admin" } : null,
  logout: vi.fn(async () => {}), authFetch: state.fetch,
}) }));
vi.mock("../hooks/useSensitiveReauthDialog", () => ({ useSensitiveReauthDialog: () => ({ requestSensitiveReauth: vi.fn(async () => false), sensitiveReauthModal: null }) }));
vi.mock("./VoiceNavButton", () => ({ default: () => null }));

function CurrentPath() {
  return <output data-testid="current-path">{useLocation().pathname}</output>;
}

function Page({ locale }: { locale: string }) {
  return <MemoryRouter initialEntries={["/login"]}>
    <HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR, isTranslating: false,
      setLocaleFromDropdown: vi.fn(async () => {}), setLocaleFromVoice: vi.fn(async () => ({ voiceAck: "", dictationInstruction: "" })) }}>
      <Header /><CurrentPath />
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


describe("primary navigation follows the authenticated role", () => {
  afterEach(() => { cleanup(); localStorage.clear(); state.fetch.mockReset(); state.authenticated = false; state.role = "SUPERADMIN"; });

  it.each(UI_LOCALES)("opens WalkIn directly for RECEPTION with local labels on desktop and mobile in %s", locale => {
    state.authenticated = true;
    state.role = "RECEPTION";
    render(<Page locale={locale} />);
    const arrival = localizeHeaderUiLabel(UI_LABELS_FR.header.nav.walkInArrival, locale)!;
    const clinical = localizeHeaderUiLabel(UI_LABELS_FR.header.nav.clinicalAnalysis, locale)!;
    const quick = localizeHeaderUiLabel(UI_LABELS_FR.header.nav.quickMode, locale)!;
    const summary = localizeHeaderUiLabel(UI_LABELS_FR.header.nav.patientSummary, locale)!;
    expect(screen.queryByRole("link", { name: quick })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: summary })).not.toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: arrival });
    links.forEach(link => expect(link).toHaveAttribute("href", "/walk-in-arrival"));
    expect(screen.queryByRole("link", { name: clinical })).not.toBeInTheDocument();
    fireEvent.click(links[0]);
    expect(screen.getByTestId("current-path")).toHaveTextContent("/walk-in-arrival");
    expect(screen.getAllByRole("link", { name: arrival })[0]).toHaveClass("bg-blue-50");
    fireEvent.click(screen.getByRole("button", { name: localizeHeaderUiLabel(UI_LABELS_FR.header.controls.openMenu, locale)! }));
    expect(screen.queryByRole("link", { name: quick })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: summary })).not.toBeInTheDocument();
    const mobileLinks = screen.getAllByRole("link", { name: arrival });
    expect(mobileLinks.length).toBeGreaterThan(links.length);
    mobileLinks.forEach(link => expect(link).toHaveAttribute("href", "/walk-in-arrival"));
    expect(screen.queryByRole("link", { name: clinical })).not.toBeInTheDocument();
    fireEvent.click(mobileLinks.at(-1)!);
    expect(screen.queryByRole("button", { name: localizeHeaderUiLabel(UI_LABELS_FR.header.controls.close, locale)! })).not.toBeInTheDocument();
    expect(screen.getByTestId("current-path")).toHaveTextContent("/walk-in-arrival");
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it.each(["USER", "MEDECIN", "ADMIN", "SUPERADMIN"] as const)("keeps clinical analysis for %s", async role => {
    state.authenticated = true;
    state.role = role;
    state.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    await act(async () => { render(<Page locale="fr-CA" />); });
    expect(screen.getAllByRole("link", { name: UI_LABELS_FR.header.nav.quickMode }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: UI_LABELS_FR.header.nav.patientSummary }).length).toBeGreaterThan(0);
    const clinical = UI_LABELS_FR.header.nav.clinicalAnalysis;
    const links = screen.getAllByRole("link", { name: clinical });
    links.forEach(link => expect(link).toHaveAttribute("href", "/clinical"));
    expect(screen.queryByRole("link", { name: UI_LABELS_FR.header.nav.walkInArrival })).not.toBeInTheDocument();
    fireEvent.click(links[0]);
    expect(screen.getByTestId("current-path")).toHaveTextContent("/clinical");
  });
});

describe("bounded IPS clinical navigation", () => {
  afterEach(() => { cleanup(); localStorage.clear(); state.fetch.mockReset(); state.authenticated=false; state.role="SUPERADMIN"; });
  it.each(UI_LOCALES)("shows IPS collaboration and own clinical workflows without administrative or physician support links in %s", async locale => {
    state.authenticated=true; state.role="IPS";
    state.fetch.mockResolvedValue({ok:true,json:async()=>({data:[]})});
    await act(async()=>{render(<Page locale={locale}/>);});
    const title=clinicalCareAccessLabels(locale).title;
    expect(screen.getByRole("link",{name:title})).toHaveAttribute("href","/clinical-care-access");
    expect(screen.getAllByRole("link").some(link=>link.getAttribute("href")==="/consultations")).toBe(true);
    expect(screen.queryAllByRole("link").some(link=>["/cliniques","/specialists","/clinical-support-access/inbox","/clinical-support-access/request","/clinical-support-access/patients","/admin/users/manage","/quick","/patient-summary"].includes(link.getAttribute("href")||""))).toBe(false);
    fireEvent.click(screen.getByRole("button",{name:localizeHeaderUiLabel(UI_LABELS_FR.header.controls.openMenu,locale)!}));
    expect(screen.getAllByRole("link",{name:title})).toHaveLength(2);
    expect(screen.getAllByRole("link").filter(link=>link.getAttribute("href")==="/patients").length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("link").some(link=>["/cliniques","/specialists","/clinical-support-access/inbox","/clinical-support-access/request","/clinical-support-access/patients","/admin/users/manage"].includes(link.getAttribute("href")||""))).toBe(false);
  });
  it.each(["USER","RECEPTION","ADMIN","SUPERADMIN"] as const)("hides the clinical collaboration link from %s",async role=>{
    state.authenticated=true;state.role=role;state.fetch.mockResolvedValue({ok:true,json:async()=>({data:[]})});
    await act(async()=>{render(<Page locale="fr-CA"/>);});
    expect(screen.queryByRole("link",{name:clinicalCareAccessLabels("fr-CA").title})).not.toBeInTheDocument();
  });
  it("keeps physician support distinct from the new collaboration link",async()=>{
    state.authenticated=true;state.role="MEDECIN";state.fetch.mockResolvedValue({ok:true,json:async()=>({data:[]})});
    await act(async()=>{render(<Page locale="fr-CA"/>);});
    expect(screen.getByRole("link",{name:clinicalCareAccessLabels("fr-CA").title})).toHaveAttribute("href","/clinical-care-access");
    expect(screen.getAllByRole("link").some(link=>link.getAttribute("href")==="/clinical-support-access/inbox")).toBe(true);
  });
});
