import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { getLocalUiTranslation } from "../i18n/localUiTranslations";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { UI_LOCALES } from "../i18n/uiLocales";
import { PatientsPage } from "./PatientsPage";

const mocks = vi.hoisted(() => ({ fetchPatients: vi.fn() }));
vi.mock("../hooks/useAuth", () => ({
    useAuth: () => ({ user: { id: "synthetic-superadmin", role: "SUPERADMIN" }, isAuthenticated: true }),
}));
vi.mock("../services/patientsApi", async importOriginal => ({
    ...await importOriginal<typeof import("../services/patientsApi")>(),
    fetchPatientsPaginated: mocks.fetchPatients,
}));

function Page({ locale }: { locale: string }) {
    return <MemoryRouter>
        <HomeI18nContext.Provider value={{ locale } as React.ContextType<typeof HomeI18nContext>}>
            <PatientsPage />
        </HomeI18nContext.Provider>
    </MemoryRouter>;
}

beforeEach(() => {
    mocks.fetchPatients.mockReset();
    mocks.fetchPatients.mockResolvedValue({ error: {
        code: "CLINICAL_ACCESS_REQUIRED", message: "Opaque synthetic backend message", retryable: false,
    } });
    vi.stubGlobal("matchMedia", vi.fn(() => ({
        matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("patient access explanation", () => {
    it.each(UI_LOCALES)("explains delegated access and updates the displayed error in %s", async locale => {
        const source = UI_LABELS_FR.patientsPage.validation.clinicalAccessRequired;
        const { rerender } = render(<Page locale="fr-CA" />);
        expect(await screen.findByText(source)).toBeInTheDocument();
        rerender(<Page locale={locale} />);
        const translated = getLocalUiTranslation(source, locale);
        expect(translated).toBeTruthy();
        expect(screen.getByText(translated!)).toBeInTheDocument();
        expect(screen.queryByText(UI_LABELS_FR.generalUi.error)).not.toBeInTheDocument();
        expect(screen.queryByText("Opaque synthetic backend message")).not.toBeInTheDocument();
        expect(mocks.fetchPatients).toHaveBeenCalledTimes(1);
    });

    it("states the English read-only requirement explicitly", async () => {
        render(<Page locale="en-CA" />);
        expect(await screen.findByText("Delegated read-only clinical authorization is required to access patient records. The SUPERADMIN role alone does not grant this access.")).toBeInTheDocument();
    });

    it("does not mislabel unrelated server errors as a missing clinical authorization", async () => {
        mocks.fetchPatients.mockResolvedValue({ error: {
            code: "PERSISTENCE_FAILED", message: "Unregistered synthetic failure", retryable: true,
        } });
        render(<Page locale="fr-CA" />);
        expect(await screen.findByText(UI_LABELS_FR.generalUi.error)).toBeInTheDocument();
        expect(screen.queryByText(UI_LABELS_FR.patientsPage.validation.clinicalAccessRequired)).not.toBeInTheDocument();
    });
});
