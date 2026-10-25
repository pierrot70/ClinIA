import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClinicalForm } from "./ClinicalForm";
import { HomeI18nContext } from "../../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../../i18n/homeStrings";
import { UI_LABELS_FR } from "../../i18n/uiLabels.fr";
import { UI_LOCALES } from "../../i18n/uiLocales";
import { getLocalUiTranslation } from "../../i18n/localUiTranslations";
import { analysisStatusLabels } from "../../i18n/analysisStatusLabels";

vi.mock("../../hooks/useAuth", () => ({ useAuth: () => ({ isAuthenticated: false, user: null }) }));
// The panel must work when no server-provided translations are available.
vi.mock("../../services/translationApi", () => ({ translateText: vi.fn().mockResolvedValue("") }));
const f = UI_LABELS_FR.clinicalFormFields;
const keys = ["diabetesModalTitle", "diabetesModalDescription", "cardiovascularRisk", "renalFunction", "fragility", "tolerance", "glycemicGoals", "save", "cancel"] as const;
const sourceFields = [f.cardiovascularRisk, f.renalFunction, f.fragility, f.tolerance, f.glycemicGoals];
const authoredValues = ["Risque saisi — 原文 2,5", "Fonction originale  —  sin cambio", "Fragilité saisie —  unchanged", "Tolérance originale —  médicos", "Objectif original —  HbA1c 7,2 %"];
const onSubmit = vi.fn();
const text = (source: string, locale: string) => getLocalUiTranslation(source, locale)!;
function Form({ locale }: { locale: string }) {
    return <HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR,
        isTranslating: false, setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}>
        <ClinicalForm onSubmit={onSubmit} loading={false} />
    </HomeI18nContext.Provider>;
}
function selectExample(container: HTMLElement, locale: string) {
    fireEvent.change(container.querySelector("#clinical-field")!, { target: { value: "endocrinology" } });
    fireEvent.change(container.querySelector("#clinical-example-case")!, { target: { value: "diabetesType255" } });
    fireEvent.click(screen.getByRole("button", { name: text(f.diabetesParametersButton, locale) }));
}
function checkPanel(locale: string) {
    const panel = within(screen.getByRole("dialog"));
    expect(panel.getByRole("heading", { name: text(f.diabetesModalTitle, locale) })).toBeInTheDocument();
    for (const key of keys) {
        const translated = text(f[key], locale);
        expect(translated).toBeTruthy();
        expect(panel.getByText(translated)).toBeInTheDocument();
        if (locale !== "fr-CA") {
            expect(translated).not.toBe(f[key]);
            expect(panel.queryByText(f[key])).not.toBeInTheDocument();
        }
    }
    for (const source of sourceFields) expect(panel.getByLabelText(text(source, locale))).toHaveAttribute("translate", "no");
    expect(panel.getByRole("button", { name: text(f.save, locale) })).toBeEnabled();
    expect(panel.getByRole("button", { name: text(f.cancel, locale) })).toBeEnabled();
    return panel;
}
beforeEach(() => { onSubmit.mockReset(); window.localStorage.clear(); window.sessionStorage.clear(); });
afterEach(cleanup);

describe("deterministic diabetes panel labels", () => {
    it.each(UI_LOCALES)("renders all panel labels locally in %s without translating example values", locale => {
        const { container } = render(<Form locale={locale} />); selectExample(container, locale);
        const panel = checkPanel(locale);
        expect(panel.getByLabelText(text(f.cardiovascularRisk, locale))).toHaveValue("Moderate to high");
        expect(panel.getByLabelText(text(f.renalFunction, locale))).toHaveValue("Preserved or mildly reduced");
        expect(onSubmit).not.toHaveBeenCalled();
    });
    it("changes labels through all nine languages while preserving authored values and save/cancel behavior", async () => {
        const { container, rerender } = render(<Form locale="en-CA" />); selectExample(container, "en-CA");
        const initial = within(screen.getByRole("dialog"));
        const inputs = sourceFields.map((source, i) => {
            const input = initial.getByLabelText(text(source, "en-CA"));
            fireEvent.change(input, { target: { value: authoredValues[i] } }); return input;
        });
        const weight = initial.getByRole("spinbutton", { name: text(f.weight, "en-CA") });
        fireEvent.change(weight, { target: { value: "91.25" } });
        for (const locale of UI_LOCALES) {
            rerender(<Form locale={locale} />); const panel = checkPanel(locale);
            sourceFields.forEach((source, i) => {
                expect(panel.getByLabelText(text(source, locale))).toBe(inputs[i]);
                expect(inputs[i]).toHaveValue(authoredValues[i]);
            });
            expect(panel.getByRole("spinbutton", { name: text(f.weight, locale) })).toBe(weight);
            expect(weight).toHaveValue(91.25);
        }
        const locale = UI_LOCALES.at(-1)!;
        fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: text(f.save, locale) }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: text(f.diabetesParametersButton, locale) }));
        let panel = checkPanel(locale);
        sourceFields.forEach((source, i) => expect(panel.getByLabelText(text(source, locale))).toHaveValue(authoredValues[i]));
        fireEvent.change(panel.getByLabelText(text(f.tolerance, locale)), { target: { value: "Discard this edit" } });
        fireEvent.click(panel.getByRole("button", { name: text(f.cancel, locale) }));
        fireEvent.click(screen.getByRole("button", { name: text(f.diabetesParametersButton, locale) }));
        panel = checkPanel(locale);
        expect(panel.getByLabelText(text(f.tolerance, locale))).toHaveValue(authoredValues[3]);
        fireEvent.click(panel.getByRole("button", { name: text(f.cancel, locale) }));
        fireEvent.click(screen.getByRole("button", { name: analysisStatusLabels(locale).analyze }));
        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
        expect(onSubmit.mock.calls[0][0]).toMatchObject({ weight: 91.25, diabetes_context: {
            cardiovascular_risk: authoredValues[0], renal_function: authoredValues[1], fragility: authoredValues[2],
            tolerance: authoredValues[3], glycemic_goals: authoredValues[4],
        } });
    });
});
