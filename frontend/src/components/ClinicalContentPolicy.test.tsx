import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { UI_LOCALES } from "../i18n/uiLocales";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { getLocalUiTranslation } from "../i18n/localUiTranslations";
import TreatmentCard, { type ClinicalTreatmentCardData } from "./TreatmentCard";
import { ClinicalResultReturnProvider, useClinicalResultReturn } from "../contexts/ClinicalResultReturnContext";
import TreatmentDetails from "../pages/TreatmentDetails";
import AITreatmentTable from "./AITreatmentTable";
import ClinicalDemoResult from "./ClinicalDemoResult";
import { ClinicalResultPage } from "../pages/ClinicalResultPage";
import { PatientClinicalNotesModal } from "./clinical/PatientClinicalNotesModal";
import { SubmittedClinicalContext } from "./clinical/SubmittedClinicalContext";

const { translatedSources } = vi.hoisted(() => ({ translatedSources: [] as string[] }));
vi.mock("../hooks/useTranslation", async importOriginal => {
    const original = await importOriginal<typeof import("../hooks/useTranslation")>();
    return { ...original, useTranslation: (options: Parameters<typeof original.useTranslation>[0]) => {
        translatedSources.push(options.text);
        return original.useTranslation(options);
    } };
});

const treatment = {
    id: "synthetic-option", name: "English clinical option", shortName: "Option",
    class: "English drug class", summary: "English summary requiring renal follow-up.",
    justification: "English clinical rationale.", contraindications: ["English contraindication."],
    efficacy: 0.5, sideEffectScore: 10, flags: [], details: "English source details.",
};
function NavigationStateProbe() {
    const { state } = useLocation();
    return <output data-testid="navigation-state">{JSON.stringify(state)}</output>;
}
// Standalone-card fixtures follow ClinicalDemoResult's caller contract: the
// click saves the displayed treatment in memory before navigating with a key.
function NavigableTreatmentCard({ treatment, sourceMode }: { treatment: ClinicalTreatmentCardData; sourceMode?: string }) {
    const results = useClinicalResultReturn()!;
    return <TreatmentCard treatment={treatment} sourceMode={sourceMode} resultReturn={{
        key: "synthetic-result",
        save: () => results.save("synthetic-result", {
            view: { demoData: {}, sourceMode }, treatments: [treatment],
        }),
    }} />;
}
function expectOpaqueTreatmentNavigation(treatmentId: string) {
    const state = JSON.parse(screen.getByTestId("navigation-state").textContent!);
    expect(state).toEqual({ clinicalResultKey: expect.any(String), treatmentId });
}
function Wrapper({ locale, children }: { locale: string; children: React.ReactNode }) {
    return <MemoryRouter><HomeI18nContext.Provider value={{ locale } as React.ContextType<typeof HomeI18nContext>}>
        <ClinicalResultReturnProvider><NavigationStateProbe />{children}</ClinicalResultReturnProvider>
    </HomeI18nContext.Provider></MemoryRouter>;
}
beforeEach(() => {
    translatedSources.length = 0;
    vi.stubGlobal("matchMedia", vi.fn(() => ({
        matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("clinical source language and multilingual UI", () => {
    it.each(UI_LOCALES)("keeps treatment data in English and headings translated in %s", locale => {
        render(<Wrapper locale={locale}><TreatmentCard treatment={treatment} /><AITreatmentTable treatments={[treatment]} /></Wrapper>);
        for (const source of [treatment.name, treatment.summary, treatment.class, treatment.justification, ...treatment.contraindications]) {
            expect(screen.getAllByText(source).length).toBeGreaterThan(0);
            expect(translatedSources).not.toContain(source);
        }
        const heading = getLocalUiTranslation(UI_LABELS_FR.residualClinicalUi.proposedOptions, locale)!;
        expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    });

    it.each(UI_LOCALES.flatMap(locale => [
        { locale, source: "  Always recommended as a first-line option.  " },
        { locale, source: "  Justification historique rédigée en français.  " },
    ]))("preserves justification verbatim from card to detail with empty fields in $locale: $source", ({ locale, source }) => {
        const sparse = { ...treatment, summary: " \t ", details: "", indication: "", justification: source };
        render(<Wrapper locale={locale}><Routes>
            <Route path="/" element={<NavigableTreatmentCard treatment={sparse} sourceMode="real" />} />
            <Route path="/treatment/:id" element={<TreatmentDetails />} />
        </Routes></Wrapper>);
        const cardText = screen.getByText(source.trim());
        expect(cardText.textContent).toBe(source);
        expect(cardText).toHaveAttribute("translate", "no");
        fireEvent.click(screen.getByRole("link", { name: getLocalUiTranslation(UI_LABELS_FR.componentUi.details, locale)! }));
        expectOpaqueTreatmentNavigation(treatment.id);
        const detailText = screen.getByText(source.trim());
        expect(detailText.textContent).toBe(source);
        expect(detailText).toHaveAttribute("translate", "no");
        expect(translatedSources).not.toContain(source);
    });

    it("keeps manually opened result content available during pointer travel and navigates to treatment details", () => {
        vi.stubGlobal("matchMedia", vi.fn(() => ({
            matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(),
        })));
        render(<Wrapper locale="en-CA"><Routes>
            <Route path="/" element={<ClinicalDemoResult demoData={{ treatments: [treatment] } as any} />} />
            <Route path="/treatment/:id" element={<TreatmentDetails />} />
        </Routes></Wrapper>);
        const toggle = screen.getByRole("button", { name: /Alternatives and recommendations/i });
        const section = toggle.closest("section")!;
        expect(toggle).toHaveAttribute("aria-expanded", "false");
        fireEvent.mouseEnter(section);
        expect(toggle).toHaveAttribute("aria-expanded", "false");
        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute("aria-expanded", "true");
        fireEvent.mouseLeave(section);
        expect(toggle).toHaveAttribute("aria-expanded", "true");
        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute("aria-expanded", "false");
        fireEvent.click(toggle);
        fireEvent.mouseLeave(section);
        fireEvent.click(screen.getByRole("link", { name: "Details" }));
        expectOpaqueTreatmentNavigation(treatment.id);
        expect(screen.getByRole("heading", { level: 1, name: treatment.name })).toBeInTheDocument();
        expect(screen.getByText(treatment.details)).toHaveAttribute("translate", "no");
    });

    it.each(UI_LOCALES)("keeps a localized missing explanation outside protected clinical content in card and detail in %s", locale => {
        const empty = { ...treatment, summary: " \t ", details: "", justification: " ", indication: "\n" };
        render(<Wrapper locale={locale}><Routes>
            <Route path="/" element={<NavigableTreatmentCard treatment={empty} />} />
            <Route path="/treatment/:id" element={<TreatmentDetails />} />
        </Routes></Wrapper>);
        const fallback = getLocalUiTranslation(UI_LABELS_FR.pageUi.aucunDetailSupplementaireFourniPourCetteOption, locale)!;
        expect(screen.getByText(fallback).closest('[translate="no"]')).toBeNull();
        fireEvent.click(screen.getByRole("link", { name: getLocalUiTranslation(UI_LABELS_FR.componentUi.details, locale)! }));
        expectOpaqueTreatmentNavigation(treatment.id);
        expect(screen.getByText(fallback).closest('[translate="no"]')).toBeNull();
    });

    it.each(UI_LOCALES)("keeps the empty contraindications UI label outside protected medical content in %s", locale => {
        render(<Wrapper locale={locale}><AITreatmentTable treatments={[{ ...treatment, contraindications: [] }]} /></Wrapper>);
        const fallback = getLocalUiTranslation(UI_LABELS_FR.residualClinicalUi.noneListed, locale)!;
        expect(screen.getByText(fallback).closest('[translate="no"]')).toBeNull();
        expect(screen.getByText(treatment.justification).closest('[translate="no"]')).not.toBeNull();
    });

    it.each(UI_LOCALES)("preserves diagnosis, rationale and patient summary in %s", locale => {
        const diagnosis = "English diagnostic hypothesis.";
        const rationale = "English diagnostic rationale.";
        const summary = "English patient summary from API.";
        render(<Wrapper locale={locale}><ClinicalResultPage serviceMode="real" data={{
            diagnosis: { suspected: diagnosis, justification: rationale },
            patient_summary: { plain_language: summary }, treatments: [],
        } as any} /></Wrapper>);
        for (const source of [diagnosis, rationale, summary]) {
            expect(screen.getByText(source)).toHaveAttribute("translate", "no");
            expect(translatedSources).not.toContain(source);
        }
        expect(screen.getByText(getLocalUiTranslation(UI_LABELS_FR.residualClinicalUi.englishSourceNotice, locale)!)).toBeInTheDocument();
    });

    it("keeps structured clinical content visible after UI locale switches", () => {
        const data = { clinical_summary: "English clinical assessment.", recommendations: ["English recommendation."] };
        const view = (locale: string) => <Wrapper locale={locale}><ClinicalDemoResult demoData={data as any} /></Wrapper>;
        const { rerender } = render(view("fr-CA"));
        fireEvent.click(screen.getByRole("button", { name: /Résumé clinique du patient/i }));
        expect(screen.getByText(data.clinical_summary)).toHaveAttribute("translate", "no");
        rerender(view("es-MX"));
        expect(screen.getByText(data.clinical_summary)).toHaveAttribute("translate", "no");
        fireEvent.click(screen.getByRole("button", { name: /Alternativas y recomendaciones/i }));
        expect(screen.getByText(data.recommendations[0])).toHaveAttribute("translate", "no");
        expect(translatedSources).not.toContain(data.clinical_summary);
        expect(translatedSources).not.toContain(data.recommendations[0]);
    });

    it.each(["Note originale en français : évolution favorable. 日本語のメモ。", "Nota original en español: evolución favorable.", UI_LABELS_FR.pageUi.analyseClinique])("keeps clinician notes unchanged across UI changes: %s", original => {
        const patient = { _id: "synthetic-patient", nom: "Test", prenom: "Fictif",
            num_assurance_maladie: "", secure_request_profile: { clinicalNotes: original } };
        const view = (locale: string) => <Wrapper locale={locale}>
            <PatientClinicalNotesModal patient={patient} onClose={() => {}} onSaved={() => {}} />
            <SubmittedClinicalContext locale={locale} context={{ age: 55, sex: "male", symptoms: [original],
                medical_history: [], current_medications: [] }} />
        </Wrapper>;
        const { rerender } = render(view("es-MX"));
        const editor = screen.getByRole("textbox");
        expect((editor as HTMLTextAreaElement).value).toContain(original);
        expect(editor).toHaveAttribute("translate", "no");
        expect(editor).not.toHaveAttribute("lang");
        rerender(view("he"));
        expect((editor as HTMLTextAreaElement).value).toContain(original);
        expect(screen.getByText(original)).toHaveAttribute("translate", "no");
        expect(translatedSources).not.toContain(original);
    });
});
