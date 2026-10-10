import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { UI_LOCALES } from "../i18n/uiLocales";
import { localizeResidualUiLabel } from "../i18n/residualUiLabels";
import AITreatmentTable from "./AITreatmentTable";
import ClinicalDemoResult from "./ClinicalDemoResult";

vi.mock("../hooks/useTranslation", () => ({
    useTranslation: ({ text }: { text: string }) => ({ translated: text, loading: false, error: null }),
}));

describe("fixed clinical result wording follows selected UI language", () => {
    it.each(UI_LOCALES)("localizes treatment headings and AI error assistance in %s", locale => {
        render(<HomeI18nContext.Provider value={{ locale } as any}>
            <AITreatmentTable treatments={[]} language="en" />
            <ClinicalDemoResult demoData={{ error: "Opaque diagnostic", errorCode: "OPENAI_ANALYZE_SATURATED" }} />
        </HomeI18nContext.Provider>);
        const fixed = UI_LABELS_FR.residualClinicalUi;
        expect(screen.getByRole("heading", { name: localizeResidualUiLabel(fixed.proposedOptions, locale)! })).toBeVisible();
        for (const label of [fixed.treatment, fixed.rationale, fixed.contraindications]) {
            expect(screen.getByRole("columnheader", { name: localizeResidualUiLabel(label, locale)! })).toBeVisible();
        }
        expect(screen.getByRole("heading", { name: localizeResidualUiLabel(fixed.analysisErrorTitle, locale)! })).toBeVisible();
        expect(screen.getByText(localizeResidualUiLabel(fixed.saturatedHelp, locale)!)).toBeVisible();
        expect(screen.getByText(localizeResidualUiLabel(fixed.requestRetained, locale)!)).toBeVisible();
    });
});
