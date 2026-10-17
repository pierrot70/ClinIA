import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { UI_LOCALES } from "../i18n/uiLocales";
import { getLocalUiTranslation } from "../i18n/localUiTranslations";
import { appointmentSpecialtyLabel } from "../i18n/appointmentSpecialtyLabels";
import { SPECIALTIES } from "../data/specialties";
import { SpecialistsPage } from "./SpecialistsPage";

const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), clinics: vi.fn(), accounts: vi.fn() }));
vi.mock("../services/specialistsApi", () => ({ fetchSpecialistsPaginated: api.list, createSpecialist: api.create,
    updateSpecialist: api.update, deleteSpecialist: api.remove, fetchEligibleClinicianAccounts: api.accounts }));
vi.mock("../services/cliniqueApi", () => ({ fetchCliniquesPaginated: api.clinics }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ user: { role: "SUPERADMIN" } }) }));
vi.mock("../services/translationApi", () => ({ translateText: vi.fn().mockResolvedValue("") }));

function Page({ locale }: { locale: string }) {
    return <MemoryRouter><HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR, isTranslating: false,
        setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}><SpecialistsPage /></HomeI18nContext.Provider></MemoryRouter>;
}
beforeEach(() => {
    vi.clearAllMocks();
    const meta = { page: 1, limit: 10, total: 9, totalPages: 1, source: "mock", model: "synthetic" };
    api.list.mockResolvedValue({ data: { data: SPECIALTIES.map((specialite, i) => ({ _id: `synthetic-${i}`,
        nom: `Last${i}`, prenom: `First${i}`, numero_medecin: `SYNTHETIC-${i}`, specialite, disponibilites: [] })), meta } });
    api.clinics.mockResolvedValue({ data: { data: [], meta } });
    api.accounts.mockResolvedValue({ data: [] });
});
afterEach(cleanup);

describe("specialist specialty translations", () => {
    it.each(UI_LOCALES)("translates all specialties in the list, mobile cards and creation selector in %s", async locale => {
        render(<Page locale={locale} />);
        for (const specialty of SPECIALTIES) {
            const name = appointmentSpecialtyLabel(specialty, locale);
            expect(await screen.findByRole("cell", { name })).toBeVisible();
            expect(screen.getAllByText(name).length).toBeGreaterThanOrEqual(2);
        }
        fireEvent.click(screen.getByRole("button", { name: getLocalUiTranslation(UI_LABELS_FR.specialistsPage.tabs.create, locale)! }));
        for (const specialty of SPECIALTIES)
            expect(screen.getByRole("option", { name: appointmentSpecialtyLabel(specialty, locale) })).toHaveValue(specialty);
        expect(api.create).not.toHaveBeenCalled();
        expect(api.update).not.toHaveBeenCalled();
        expect(api.remove).not.toHaveBeenCalled();
    });

    it("preserves a selected specialty and the emergency slot rule after changing language", async () => {
        const { rerender } = render(<Page locale="en-CA" />);
        await screen.findByRole("cell", { name: "Family Physician" });
        fireEvent.click(screen.getByRole("button", { name: getLocalUiTranslation(UI_LABELS_FR.specialistsPage.tabs.create, "en-CA")! }));
        const select = screen.getByRole("option", { name: "Emergency Physician" }).closest("select")!;
        fireEvent.change(select, { target: { value: "Urgentologue" } });
        rerender(<Page locale="ja" />);
        expect(select).toHaveValue("Urgentologue");
        expect(screen.getByRole("option", { name: "救急医" })).toHaveProperty("selected", true);
        const regularOption = document.querySelector('option[value="regular"]')!;
        expect(regularOption).toBeDisabled();
        expect(api.create).not.toHaveBeenCalled();
        expect(api.update).not.toHaveBeenCalled();
    });
});
