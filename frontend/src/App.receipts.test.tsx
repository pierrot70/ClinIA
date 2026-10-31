import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { HomeI18nContext } from "./contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "./i18n/homeStrings";
import { getMyWriteReceiptsLabels } from "./i18n/myWriteReceiptsLabels";

const state = vi.hoisted(() => ({ role: "RECEPTION", authenticated: true, authFetch: vi.fn(), receipts: vi.fn(), patients: vi.fn() }));
vi.mock("./hooks/useAuth", () => ({ useAuth: () => ({ status: state.authenticated ? "authenticated" : "anonymous", isAuthenticated: state.authenticated, user: state.authenticated ? { role: state.role, id: "synthetic-user" } : null, authFetch: state.authFetch }) }));
vi.mock("./components/Header", () => ({ default: () => null }));
vi.mock("./pages/QuickMode", () => ({ default: () => <div data-testid="quick-example" /> }));
vi.mock("./pages/PatientSummary", () => ({ default: () => <div data-testid="summary-example" /> }));
vi.mock("./components/Footer", () => ({ default: () => null }));
vi.mock("./pages/WalkInArrivalPage", () => ({ WalkInArrivalPage: () => <div data-testid="walk-in-route" /> }));
vi.mock("./pages/LoginPage", () => ({ default: () => <div data-testid="login-route" /> }));
vi.mock("./contexts/SecurityIncidentContext", () => ({ useSecurityIncident: () => ({ blockingIncident: null, setBlockingIncident: vi.fn() }) }));
vi.mock("./contexts/ReceptionClinicContext", () => ({ useReceptionClinic: () => ({ activeClinic: null, clinics: [], isLoading: false, changeClinic: vi.fn() }) }));
vi.mock("./hooks/useTranslation", () => ({ useTranslation: ({ text }: { text: string }) => ({ translated: text }) }));
vi.mock("./services/writeOperationAuditsApi", () => ({ fetchMyWriteReceipts: state.receipts }));
vi.mock("./services/patientsApi", () => ({ fetchPatientsPaginated: state.patients }));

function Page({ path = "/my-write-receipts" }: { path?: string }) {
    return <MemoryRouter initialEntries={[path]}><HomeI18nContext.Provider value={{ locale: "fr-CA", strings: HOME_STRINGS_FR, isTranslating: false, setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}><App /></HomeI18nContext.Provider></MemoryRouter>;
}
beforeEach(() => {
    vi.clearAllMocks(); state.authenticated = true; state.role = "RECEPTION";
    state.authFetch.mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
    state.receipts.mockResolvedValue({ data: { logs: [], pagination: { page: 1, total: 0, totalPages: 1 } } });
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ data: { maintenanceActive: false } }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("personal receipt route", () => {
    it.each(["RECEPTION", "USER", "MEDECIN", "ADMIN", "SUPERADMIN"])("renders receipts rather than a default redirect for %s", async role => {
        state.role = role;
        render(<Page />);
        await screen.findByRole("heading", { name: getMyWriteReceiptsLabels("fr-CA").title });
        await waitFor(() => expect(state.receipts).toHaveBeenCalled());
        expect(screen.queryByTestId("walk-in-route")).not.toBeInTheDocument();
        expect(state.patients).not.toHaveBeenCalled();
    });
    it("still sends reception away from the protected clinical analysis route", async () => {
        render(<Page path="/clinical" />);
        await screen.findByTestId("walk-in-route");
        expect(state.receipts).not.toHaveBeenCalled();
    });
    it("keeps personal receipts behind authentication", async () => {
        state.authenticated = false;
        render(<Page />);
        await screen.findByTestId("login-route");
        expect(state.receipts).not.toHaveBeenCalled();
        expect(state.patients).not.toHaveBeenCalled();
    });
});

describe("clinical example tools role guards", () => {
    it.each(["/quick", "/patient-summary"])("redirects RECEPTION away from %s before mounting the clinical example", async path => {
        render(<Page path={path} />);
        await screen.findByTestId("walk-in-route");
        expect(screen.queryByTestId("quick-example")).not.toBeInTheDocument();
        expect(screen.queryByTestId("summary-example")).not.toBeInTheDocument();
        expect(state.receipts).not.toHaveBeenCalled();
        expect(state.patients).not.toHaveBeenCalled();
    });
    it.each(["/quick", "/patient-summary"])("requires authentication for %s", async path => {
        state.authenticated = false;
        render(<Page path={path} />);
        await screen.findByTestId("login-route");
        expect(screen.queryByTestId("quick-example")).not.toBeInTheDocument();
        expect(screen.queryByTestId("summary-example")).not.toBeInTheDocument();
    });
    it.each(["USER", "MEDECIN", "ADMIN", "SUPERADMIN"])("preserves both tools for %s", async role => {
        state.role = role;
        const page = render(<Page path="/quick" />);
        await screen.findByTestId("quick-example");
        page.unmount();
        render(<Page path="/patient-summary" />);
        await screen.findByTestId("summary-example");
        expect(screen.queryByTestId("walk-in-route")).not.toBeInTheDocument();
    });
});
