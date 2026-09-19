import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeI18nContext } from "../../contexts/HomeI18nContext";
import { clinicalSafetyTranslations } from "../../i18n/clinicalSafetyLabels";
import { ClinicalSafetySections } from "./ClinicalSafetySections";

describe("ClinicalSafetySections", () => {
    it.each(Object.keys(clinicalSafetyTranslations))("updates UI labels to %s while preserving clinical content", locale => {
        const view = (language: string) => <HomeI18nContext.Provider value={{ locale: language } as any}>
            <ClinicalSafetySections alternatives={[{ name: "Alternative A", reason: "Review contraindications first." }]} redFlags={["Urgent clinical assessment required."]} />
        </HomeI18nContext.Provider>;
        const { rerender } = render(view("en-CA"));
        expect(screen.getByRole("heading", { name: "Red flags" })).toBeVisible();
        rerender(view(`${locale}-CA`));
        expect(screen.getByRole("heading", { name: clinicalSafetyTranslations[locale].redFlags })).toBeVisible();
        expect(screen.getByRole("heading", { name: clinicalSafetyTranslations[locale].alternatives })).toBeVisible();
        expect(screen.getByText("Alternative A")).toBeVisible();
        expect(screen.getByText("Review contraindications first.")).toBeVisible();
        expect(screen.getByText("Urgent clinical assessment required.")).toBeVisible();
    });

    it("does not infer reassuring claims from missing or malformed lists", () => {
        const { container, rerender } = render(<ClinicalSafetySections />);
        expect(container).toBeEmptyDOMElement();
        rerender(<ClinicalSafetySections alternatives={[null, {}, { name: " " }]} redFlags={[null, {}, " "]} />);
        expect(container).toBeEmptyDOMElement();
    });

    it("renders medical text safely and falls back to English for unsupported locales", () => {
        render(<ClinicalSafetySections targetLang="xx" alternatives={[{ name: "<script>alert(1)</script>", reason: {} }]} redFlags={["<img src=x onerror=alert(1)>"]} />);
        expect(screen.getByRole("heading", { name: "Therapeutic alternatives" })).toBeVisible();
        expect(screen.getByText("<script>alert(1)</script>")).toBeVisible();
        expect(document.querySelector("script, img")).toBeNull();
    });
});
