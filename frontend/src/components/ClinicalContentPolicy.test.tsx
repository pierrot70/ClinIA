import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { UI_LOCALES } from "../i18n/uiLocales";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { getLocalUiTranslation } from "../i18n/localUiTranslations";
import TreatmentCard from "./TreatmentCard";
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
function Wrapper({ locale, children }: { locale: string; children: React.ReactNode }) {
    return <MemoryRouter><HomeI18nContext.Provider value={{ locale } as React.ContextType<typeof HomeI18nContext>}>
        {children}
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
