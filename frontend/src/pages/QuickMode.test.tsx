import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { quickModeHeaders, QUICK_MODE_PANEL_EN } from "../i18n/quickModeLabels";
import QuickMode from "./QuickMode";
import { getExampleUiLabels } from "../i18n/exampleUiLabels";

const state = vi.hoisted(() => ({ locale: "fr-CA" }));
vi.mock("../contexts/HomeI18nContext", () => ({ useHomeI18n: () => state }));

describe("quick mode header", () => {
    afterEach(cleanup);
    it.each(["fr-CA", "en-CA", "es", "ko-KR", "vi", "no-NO", "ja", "zh", "he"])(
        "switches both header labels to %s without changing the recommendations", locale => {
            state.locale = "fr-CA";
            const { rerender, container } = render(<QuickMode />);
            const panel = screen.getByTestId("quick-clinical-example").outerHTML;
            state.locale = locale;
            rerender(<QuickMode />);
            const expected = quickModeHeaders[locale.split("-")[0]];
            expect(screen.getByRole("heading", { level: 1, name: expected.title })).toBeInTheDocument();
            expect(screen.getByText(expected.description)).toBeInTheDocument();
            expect(container.querySelector("header")).toHaveAttribute("lang", locale);
            expect(screen.getByTestId("quick-clinical-example").outerHTML).toBe(panel);
            const ui = getExampleUiLabels(locale);
            expect(screen.getByRole("region", { name: ui.quickTitle })).toHaveTextContent(ui.quickDisclaimer);
            const clinicalPanel = screen.getByTestId("quick-clinical-example");
            for (const key of (["first", "second", "third"] as const)) expect(clinicalPanel).toHaveTextContent(QUICK_MODE_PANEL_EN[key]);
            expect(clinicalPanel).toHaveAttribute("lang", "en");
            expect(clinicalPanel).toHaveAttribute("dir", "ltr");
            expect(clinicalPanel).toHaveAttribute("translate", "no");
        }
    );
});
