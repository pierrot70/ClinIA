import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { ClinicalAnalyzePage } from "./ClinicalAnalyzePage";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { UI_LOCALES } from "../i18n/uiLocales";
import { getLocalUiTranslation } from "../i18n/localUiTranslations";

const idle = vi.hoisted(() => ({
    result: null, loading: false, error: null, errorCode: null, errorFields: [],
    responseMeta: null, analyze: vi.fn(), resetAnalysis: vi.fn(),
}));
vi.mock("../hooks/useClinicalAnalysis", () => ({ useClinicalAnalysis: () => idle }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ user: null, isAuthenticated: false }) }));

function Page({ locale }: { locale: string }) {
    return <MemoryRouter><HomeI18nContext.Provider value={{ locale } as React.ContextType<typeof HomeI18nContext>}>
        <ClinicalAnalyzePage />
    </HomeI18nContext.Provider></MemoryRouter>;
}
beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("matchMedia", vi.fn(() => ({
        matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("clinical form locale persistence", () => {
    it("keeps the selected example and edited patient values mounted across EN, ES and HE changes", () => {
        const { container, rerender } = render(<Page locale="en-CA" />);
        const field = container.querySelector("#clinical-field")!;
        fireEvent.change(field, { target: { value: "endocrinology" } });
        const picker = container.querySelector("#clinical-example-case")!;
        fireEvent.change(picker, { target: { value: "diabetesType255" } });
        const diagnosis = container.querySelector("#clinical-diagnosis")!;
        const symptoms = container.querySelector("#clinical-symptoms")!;
        expect(diagnosis).toHaveValue("Type 2 diabetes");
        fireEvent.change(diagnosis, { target: { value: "Motif original du médecin" } });
        fireEvent.change(symptoms, { target: { value: "Síntoma original del paciente" } });
        for (const locale of ["es", "he", "en-CA"]) {
            rerender(<Page locale={locale} />);
            expect(container.querySelector("#clinical-field")).toBe(field);
            expect(field).toHaveValue("endocrinology");
            expect(picker).toHaveValue("diabetesType255");
            expect(container.querySelector("#clinical-diagnosis")).toBe(diagnosis);
            expect(diagnosis).toHaveValue("Motif original du médecin");
            expect(symptoms).toHaveValue("Síntoma original del paciente");
        }
    });

    it.each(UI_LOCALES)("localizes the diabetes parameters action in %s", locale => {
        const { container } = render(<Page locale={locale} />);
        fireEvent.change(container.querySelector("#clinical-field")!, { target: { value: "endocrinology" } });
        fireEvent.change(container.querySelector("#clinical-example-case")!, { target: { value: "diabetesType255" } });
        const source = UI_LABELS_FR.clinicalFormFields.diabetesParametersButton;
        const translated = getLocalUiTranslation(source, locale)!;
        expect(translated).toBeTruthy();
        expect(screen.getByRole("button", { name: translated })).toBeInTheDocument();
        if (locale !== "fr-CA") expect(screen.queryByRole("button", { name: source })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Parametres diabete type 2" })).not.toBeInTheDocument();
    });
});
