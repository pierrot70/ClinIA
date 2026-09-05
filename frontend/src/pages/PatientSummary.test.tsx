import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { PATIENT_SUMMARY_EXAMPLE_EN, patientSummaryHeaders } from "../i18n/patientSummaryExample";
import PatientSummary from "./PatientSummary";

function Page({ locale }: { locale: string }) {
    return <HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR, isTranslating: false,
        setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}>
        <PatientSummary />
    </HomeI18nContext.Provider>;
}

describe("patient summary English-only example", () => {
    afterEach(cleanup);
    it.each(["fr-CA", "en-CA", "es", "ko-KR", "vi", "no-NO", "ja", "zh", "he"])(
        "preserves the complete English panel when switching to %s", locale => {
            const { rerender } = render(<Page locale="en-CA" />);
            const panel = screen.getByRole("region", { name: "Example patient content" });
            const before = panel.outerHTML;
            rerender(<Page locale={locale} />);
            expect(panel.outerHTML).toBe(before);
            const expected = patientSummaryHeaders[locale.split("-")[0]];
            expect(expected.title).toBeTruthy();
            expect(expected.description).toBeTruthy();
            const heading = screen.getByRole("heading", { level: 1, name: expected.title });
            expect(heading.closest("header")).toHaveAttribute("lang", locale);
            expect(heading.closest("header")).toHaveAttribute("dir", locale === "he" ? "rtl" : "ltr");
            expect(screen.getByText(expected.description)).toBeInTheDocument();
            Object.values(PATIENT_SUMMARY_EXAMPLE_EN).forEach(text => expect(panel).toHaveTextContent(text));
            expect(panel).toHaveAttribute("lang", "en");
            expect(panel).toHaveAttribute("dir", "ltr");
            expect(panel).toHaveAttribute("translate", "no");
        }
    );
});
