import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { PATIENT_SUMMARY_EXAMPLE_EN, patientSummaryHeaders } from "../i18n/patientSummaryExample";
import PatientSummary from "./PatientSummary";
import { getExampleUiLabels } from "../i18n/exampleUiLabels";

function Page({ locale }: { locale: string }) {
    return <HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR, isTranslating: false,
        setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}>
        <PatientSummary />
    </HomeI18nContext.Provider>;
}

describe("patient summary English-only example", () => {
    afterEach(cleanup);
    it.each(["fr-CA", "en-CA", "es", "ko-KR", "vi", "no-NO", "ja", "zh", "he"])(
        "localizes interface labels while preserving English clinical content in %s", locale => {
            const { rerender } = render(<Page locale="en-CA" />);
            const panel = screen.getByRole("region", { name: "Example patient content" });
            const before = [...panel.querySelectorAll('[translate="no"]')].map(node => node.outerHTML);
            rerender(<Page locale={locale} />);
            expect([...panel.querySelectorAll('[translate="no"]')].map(node => node.outerHTML)).toEqual(before);
            const expected = patientSummaryHeaders[locale.split("-")[0]];
            expect(expected.title).toBeTruthy();
            expect(expected.description).toBeTruthy();
            const heading = screen.getByRole("heading", { level: 1, name: expected.title });
            expect(heading.closest("header")).toHaveAttribute("lang", locale);
            expect(heading.closest("header")).toHaveAttribute("dir", locale === "he" ? "rtl" : "ltr");
            expect(screen.getByText(expected.description)).toBeInTheDocument();
            const ui = getExampleUiLabels(locale);
            expect(panel).toHaveAccessibleName(ui.patientTitle);
            expect(panel).toHaveTextContent(ui.medicationLabel);
            expect(panel).toHaveTextContent(ui.patientDisclaimer);
            for (const key of (["summary", "medication", "instruction", "monitoring", "followUp"] as const)) expect(panel).toHaveTextContent(PATIENT_SUMMARY_EXAMPLE_EN[key]);
            expect(panel).toHaveAttribute("lang", locale);
            for (const clinical of panel.querySelectorAll('[translate="no"]')) {
                expect(clinical).toHaveAttribute("lang", "en");
                expect(clinical).toHaveAttribute("dir", "ltr");
            }
        }
    );
});
