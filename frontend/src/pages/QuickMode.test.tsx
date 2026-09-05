import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { quickModeHeaders, QUICK_MODE_PANEL_EN } from "../i18n/quickModeLabels";
import QuickMode from "./QuickMode";

const state = vi.hoisted(() => ({ locale: "fr-CA" }));
vi.mock("../contexts/HomeI18nContext", () => ({ useHomeI18n: () => state }));

describe("quick mode header", () => {
    afterEach(cleanup);
    it.each(["fr-CA", "en-CA", "es", "ko-KR", "vi", "no-NO", "ja", "zh", "he"])(
        "switches both header labels to %s without changing the recommendations", locale => {
            state.locale = "fr-CA";
            const { rerender, container } = render(<QuickMode />);
            const panel = container.querySelector("section")!.outerHTML;
            state.locale = locale;
            rerender(<QuickMode />);
            const expected = quickModeHeaders[locale.split("-")[0]];
            expect(screen.getByRole("heading", { level: 1, name: expected.title })).toBeInTheDocument();
            expect(screen.getByText(expected.description)).toBeInTheDocument();
            expect(container.querySelector("header")).toHaveAttribute("lang", locale);
            expect(container.querySelector("section")!.outerHTML).toBe(panel);
            const clinicalPanel = screen.getByRole("region", { name: "Simulated recommendation" });
            Object.values(QUICK_MODE_PANEL_EN).forEach(text => expect(clinicalPanel).toHaveTextContent(text));
            expect(clinicalPanel).toHaveAttribute("lang", "en");
            expect(clinicalPanel).toHaveAttribute("dir", "ltr");
            expect(clinicalPanel).toHaveAttribute("translate", "no");
        }
    );
});
