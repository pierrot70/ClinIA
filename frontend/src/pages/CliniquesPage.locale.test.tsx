import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { getLocalUiTranslation } from "../i18n/localUiTranslations";
import { CliniquesPage } from "./CliniquesPage";

const api = vi.hoisted(() => ({
    list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), translate: vi.fn(),
}));
vi.mock("../services/cliniqueApi", () => ({
    fetchCliniquesPaginated: api.list,
    createClinique: api.create,
    updateClinique: api.update,
    deleteClinique: api.remove,
}));
vi.mock("../services/translationApi", () => ({ translateText: api.translate }));

function Page({ locale }: { locale: string }) {
    return <HomeI18nContext.Provider value={{
        locale, strings: HOME_STRINGS_FR, isTranslating: false,
        setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn(),
    }}><CliniquesPage /></HomeI18nContext.Provider>;
}

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.list.mockResolvedValue({ data: {
        data: [{ _id: "synthetic-clinic", nom: "Clinique synthétique", num_civique: "123",
            rue: "Rue de test", code_postal: "H2X 1S1" }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1, source: "mock", model: "Clinique" },
    } });
});
afterEach(cleanup);

describe("facility names retain their meaning when the language changes", () => {
    it("uses a clinic name in the table, filters and form in French, English and Spanish", async () => {
        const { rerender } = render(<Page locale="fr-CA" />);
        await screen.findByRole("cell", { name: "Clinique synthétique" });

        for (const [locale, name, create, search] of [
            ["en-CA", "Clinic name", "Create clinic", "Search clinics"],
            ["es", "Nombre de la clínica", "Crear clínica", "Buscar clínicas"],
            ["fr-CA", "Nom de la clinique", "Créer une clinique", "Rechercher les cliniques"],
        ]) {
            rerender(<Page locale={locale} />);
            expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
            expect(screen.getByRole("textbox", { name })).toBeInTheDocument();
            expect(screen.queryByRole("columnheader", { name: /^(Last name|Apellido)$/i })).not.toBeInTheDocument();
            expect(screen.getByRole("cell", { name: "Clinique synthétique" })).toBeInTheDocument();
            expect(screen.getByRole("cell", { name: "123 Rue de test" })).toBeInTheDocument();

            fireEvent.click(screen.getByRole("button", { name: create }));
            expect(screen.getByRole("textbox", { name })).toBeInTheDocument();
            fireEvent.click(screen.getByRole("button", { name: search }));
        }
        expect(api.translate).not.toHaveBeenCalled();
        expect(api.create).not.toHaveBeenCalled();
        expect(api.update).not.toHaveBeenCalled();
        expect(api.remove).not.toHaveBeenCalled();
    });

    it("keeps the last-name meaning for patient labels", () => {
        expect(getLocalUiTranslation("Nom", "en-CA")).toBe("Last name");
        expect(getLocalUiTranslation("Nom", "es")).toBe("Apellido");
    });
});
