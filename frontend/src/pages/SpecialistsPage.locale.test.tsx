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
import { walkInRoutingLabels } from "../i18n/walkInRoutingLabels";
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
    const meta = { page: 1, limit: 10, total: SPECIALTIES.length, totalPages: 1, source: "mock", model: "synthetic" };
    api.list.mockResolvedValue({ data: { data: SPECIALTIES.map((specialite, i) => ({ _id: `synthetic-${i}`,
        nom: `Last${i}`, prenom: `First${i}`, numero_medecin: `SYNTHETIC-${i}`, specialite, disponibilites: [] })), meta } });
    api.clinics.mockResolvedValue({ data: { data: [], meta } });
    api.accounts.mockResolvedValue({ data: [] });
});
afterEach(cleanup);

describe("specialist specialty translations", () => {
    it.each(UI_LOCALES)("translates all specialties in the list, mobile cards and creation selector in %s", async locale => {
        render(<Page locale={locale} />);
        await screen.findByRole("cell", { name: appointmentSpecialtyLabel(SPECIALTIES[0], locale) });
        // Scan the accessible table once; repeated full-page role queries made this
        // ten-profession, nine-language regression exceed its budget under CI load.
        const cells = screen.getAllByRole("cell");
        for (const specialty of SPECIALTIES) {
            const name = appointmentSpecialtyLabel(specialty, locale);
            expect(cells.find(cell => cell.textContent === name)).toBeVisible();
            expect(screen.getAllByText(name).length).toBeGreaterThanOrEqual(2);
        }
        fireEvent.click(screen.getByRole("button", { name: getLocalUiTranslation(UI_LABELS_FR.specialistsPage.tabs.create, locale)! }));
        const options = screen.getAllByRole("option");
        for (const specialty of SPECIALTIES) {
            const option = options.find(option => option.getAttribute("value") === specialty);
            expect(option).toHaveAccessibleName(appointmentSpecialtyLabel(specialty, locale));
        }
        expect(api.create).not.toHaveBeenCalled();
        expect(api.update).not.toHaveBeenCalled();
        expect(api.remove).not.toHaveBeenCalled();
    // Complete table, mobile cards and creation selector: observed 5.6 s under
    // concurrent CI load after reducing repeated accessible-role scans.
    }, 10_000);

    it("offers only IPS accounts for IPS and clears an incompatible account when changing profession", async () => {
        api.accounts.mockResolvedValue({ data: [
            { id: "physician", username: "SyntheticPhysician", email: null, role: "MEDECIN" },
            { id: "ips-account", username: "SyntheticIPS", email: null, role: "IPS" },
        ] });
        render(<Page locale="en-CA" />);
        await screen.findByRole("cell", { name: "Family Physician" });
        fireEvent.click(screen.getByRole("button", { name: getLocalUiTranslation(UI_LABELS_FR.specialistsPage.tabs.create, "en-CA")! }));
        const select = screen.getByRole("option", { name: "Specialized nurse practitioner (IPS)" }).closest("select")!;
        fireEvent.change(select, { target: { value: "IPS" } });
        const routing = walkInRoutingLabels("en-CA");
        const account = screen.getByText(routing.professionalAccount).closest("label")!.querySelector("select")!;
        expect(screen.getByRole("option", { name: "SyntheticIPS" })).toBeVisible();
        expect(screen.queryByRole("option", { name: "SyntheticPhysician" })).not.toBeInTheDocument();
        expect(screen.getByPlaceholderText(routing.professionalNumber)).toBeVisible();
        fireEvent.change(account, { target: { value: "ips-account" } });
        expect(account).toHaveValue("ips-account");
        fireEvent.change(select, { target: { value: "Medecin de famille" } });
        expect(account).toHaveValue("");
        expect(screen.getByRole("option", { name: "SyntheticPhysician" })).toBeVisible();
        expect(screen.queryByRole("option", { name: "SyntheticIPS" })).not.toBeInTheDocument();
        expect(api.create).not.toHaveBeenCalled();
        expect(api.update).not.toHaveBeenCalled();
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
