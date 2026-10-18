import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { getLocalUiTranslation } from "../i18n/localUiTranslations";
import MockStudio from "./MockStudio";

const mocks = vi.hoisted(() => ({ authFetch: vi.fn() }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ authFetch: mocks.authFetch }) }));
const content = {
    synthetic_condition: { match: ["hypertension", "pression élevée"], patient_summary: "English simulated summary.",
        treatments: [{ name: "English option", justification: "English rationale.", contraindications: ["English caution"], efficacy: 50 }] },
};
function Page({ locale }: { locale: string }) {
    return <MemoryRouter><HomeI18nContext.Provider value={{ locale } as React.ContextType<typeof HomeI18nContext>}>
        <MockStudio />
    </HomeI18nContext.Provider></MemoryRouter>;
}
beforeEach(() => {
    mocks.authFetch.mockReset();
    mocks.authFetch.mockResolvedValue({ status: 200, ok: true, json: async () => structuredClone(content) });
});
afterEach(cleanup);

describe("MockStudio source language", () => {
    it("preserves English fields and matching aliases when UI language changes and saves raw values", async () => {
        const { rerender } = render(<Page locale="fr-CA" />);
        const summary = await screen.findByDisplayValue(content.synthetic_condition.patient_summary);
        expect(summary).toHaveAttribute("lang", "en");
        expect(summary).toHaveAttribute("translate", "no");
        expect(screen.getByDisplayValue("English option")).toHaveAttribute("translate", "no");
        rerender(<Page locale="es" />);
        expect(summary).toHaveValue(content.synthetic_condition.patient_summary);
        expect(screen.getByText(getLocalUiTranslation(UI_LABELS_FR.residualClinicalUi.englishSourceNotice, "es")!)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: getLocalUiTranslation(UI_LABELS_FR.pageUi.save, "es")! }));
        await waitFor(() => expect(mocks.authFetch).toHaveBeenCalledTimes(2));
        expect(JSON.parse(mocks.authFetch.mock.calls[1][1].body)).toEqual(content);
    });

    it("authors new simulation defaults in English while keeping generated matching keys unchanged", async () => {
        render(<Page locale="fr-CA" />);
        await screen.findByDisplayValue(content.synthetic_condition.patient_summary);
        fireEvent.click(screen.getAllByRole("button", { name: UI_LABELS_FR.pageUi.ajouter })[0]);
        expect(screen.getByDisplayValue("Patient summary to customize.")).toHaveAttribute("lang", "en");
        expect(screen.getByDisplayValue("nouvelle_condition")).toBeInTheDocument();
        fireEvent.click(screen.getAllByRole("button", { name: UI_LABELS_FR.pageUi.ajouter })[1]);
        expect(screen.getByDisplayValue("New treatment option")).toHaveAttribute("translate", "no");
    });
});
