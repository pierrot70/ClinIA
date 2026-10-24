import React, { useState } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Results from "./Results";
import TreatmentDetails from "./TreatmentDetails";
import ClinicalDemoResult from "../components/ClinicalDemoResult";
import { ClinicalAnalysisNavigationProvider } from "../contexts/ClinicalAnalysisNavigationContext";
import { ClinicalResultReturnProvider, ClinicalResultSessionProvider, useClinicalResultReturn, type ClinicalResultSnapshot } from "../contexts/ClinicalResultReturnContext";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";

const transport = vi.hoisted(() => ({ fetch: vi.fn() }));
const auth = vi.hoisted(() => ({ status: "authenticated", user: { id: "synthetic-user-a", email: "synthetic@example.test" } }));
vi.mock("../services/authService", () => ({ authFetch: transport.fetch }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => auth }));

const payload = { age: 56, sex: "male" as const, diagnosis: "Hypertension", symptoms: ["Texte fictif original — sin cambio"], medical_history: [], current_medications: [] };
const data = {
    patient_summary: { plain_language: "Original cached summary", clinical_language: "Original clinical summary" },
    treatments: [
        { id: "synthetic-a", name: "Synthetic option A", justification: "Original authored explanation A", contraindications: ["A only"], monitoring: ["Monitor A"] },
        { id: "synthetic-b", name: "Synthetic option B", justification: "Original authored explanation B", contraindications: ["B only"], monitoring: ["Monitor B"] },
    ].map(t => ({ ...t, indication: "", dosage: "", duration: "", evidence_level: "C" as const })),
    alternatives: [], red_flags: ["Original warning"],
};
const view = { demoData: { ...data, summary: data.patient_summary.plain_language }, sourceMode: "mock", realAI: false, patientContext: payload };
const analysisCalls = () => transport.fetch.mock.calls.filter(([url]) => String(url).includes("/api/ai/analyze"));
function LocationProbe() {
    const location = useLocation();
    return <span data-testid="navigation-state">{JSON.stringify(location.state)}</span>;
}
function Harness({ quick = false, entry = "/clinical-demo", initialState, locale = "fr-CA" }: { quick?: boolean; entry?: string; initialState?: unknown; locale?: string }) {
    const [language, setLanguage] = useState(locale);
    return <HomeI18nContext.Provider value={{ locale: language, strings: HOME_STRINGS_FR, isTranslating: false, setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}>
        <button onClick={() => setLanguage("en-CA")}>English test control</button>
        <ClinicalResultReturnProvider><ClinicalAnalysisNavigationProvider initialPendingClinicalAnalysis={quick ? { payload } : null}>
            <MemoryRouter initialEntries={[{ pathname: entry, state: initialState }]}>
                <LocationProbe />
                <Routes>
                    <Route path="/clinical-demo" element={<ClinicalDemoResult {...view} />} />
                    <Route path="/treatment/:id" element={<TreatmentDetails />} />
                    <Route path="/results" element={<Results />} />
                </Routes>
            </MemoryRouter>
        </ClinicalAnalysisNavigationProvider></ClinicalResultReturnProvider>
    </HomeI18nContext.Provider>;
}
beforeEach(() => {
    window.localStorage.clear(); window.sessionStorage.clear();
    auth.status = "authenticated"; auth.user.id = "synthetic-user-a";
    transport.fetch.mockReset();
    transport.fetch.mockResolvedValue(new Response(JSON.stringify({ data, meta: { source: "mock", cacheHit: true } }), { status: 200 }));
});
afterEach(cleanup);

describe("return to an existing clinical result", () => {
    it.each([false, true])("restores details and repeated returns without another AI request (quick=%s)", async quick => {
        const user = userEvent.setup();
        render(<Harness quick={quick} entry={quick ? "/results" : "/clinical-demo"} />);
        const alternatives = await screen.findByRole("button", { name: /^Alternatives et recommandations/ });
        await act(async () => { await user.click(alternatives); });
        await act(async () => { await user.click(screen.getAllByRole("link", { name: "Détails" })[0]); });
        expect(await screen.findByRole("heading", { name: "Synthetic option A" })).toBeInTheDocument();
        expect(screen.getByText("A only")).toBeInTheDocument();
        const state = JSON.parse(screen.getByTestId("navigation-state").textContent!);
        expect(state).toEqual({ clinicalResultKey: expect.any(String), treatmentId: "synthetic-a" });
        expect(JSON.stringify(state)).not.toContain("Original");
        expect(JSON.stringify(state)).not.toContain("Texte fictif");
        const beforeReturn = analysisCalls().length;
        expect(beforeReturn).toBe(quick ? 1 : 0);
        await act(async () => { await user.click(screen.getByRole("button", { name: "English test control" })); });
        await act(async () => { await user.click(screen.getByRole("link", { name: "← Back to results" })); });
        expect(await screen.findByRole("heading", { name: "Synthetic option A" })).toBeInTheDocument();
        expect(screen.getAllByText("Original authored explanation A").length).toBeGreaterThan(0);
        expect(screen.queryByText(/Source: unknown/)).not.toBeInTheDocument();
        await act(async () => { await user.click(screen.getByRole("button", { name: /^Patient clinical summary/ })); });
        expect(screen.getByText("Original cached summary")).toBeInTheDocument();
        expect(screen.getByText("Texte fictif original — sin cambio")).toBeInTheDocument();
        await act(async () => { await user.click(screen.getAllByRole("link", { name: "Details" })[1]); });
        expect(await screen.findByRole("heading", { name: "Synthetic option B" })).toBeInTheDocument();
        expect(screen.getByText("B only")).toBeInTheDocument();
        expect(screen.queryByText("A only")).not.toBeInTheDocument();
        await act(async () => { await user.click(screen.getByRole("link", { name: "← Back to results" })); });
        await waitFor(() => expect(screen.getByRole("heading", { name: "Synthetic option A" })).toBeInTheDocument());
        expect(analysisCalls()).toHaveLength(beforeReturn);
        expect(window.localStorage.length).toBe(0);
        expect(window.sessionStorage.length).toBe(0);
    });

    it.each(["fr-CA", "en-CA", "es", "ko-KR", "vi", "no-NO", "ja", "zh", "he"])("shows an unavailable result in %s without inventing an analysis after reload", async locale => {
        render(<Harness entry="/results" initialState={{ clinicalResultKey: "expired-result" }} locale={locale} />);
        const status = screen.getByRole("status");
        expect(status.textContent).toBeTruthy();
        if (locale !== "fr-CA") expect(status.textContent).not.toContain("L’analyse précédente");
        expect(analysisCalls()).toHaveLength(0);
    });

    it("does not analyze on a direct results URL with no pending request", () => {
        render(<Harness entry="/results" />);
        expect(screen.getByRole("status")).toBeInTheDocument();
        expect(analysisCalls()).toHaveLength(0);
    });
});

describe("session-only result snapshots", () => {
    let store: NonNullable<ReturnType<typeof useClinicalResultReturn>>;
    function Probe() { store = useClinicalResultReturn()!; return null; }
    const snapshot = (): ClinicalResultSnapshot => ({ view: structuredClone(view), treatments: structuredClone(data.treatments).map(t => ({ ...t, shortName: t.name, class: "", flags: [] })) });

    it("clones and bounds distinct results rather than substituting the last analysis", () => {
        render(<ClinicalResultReturnProvider><Probe /></ClinicalResultReturnProvider>);
        const original = snapshot();
        store.save("A", original);
        original.view.demoData.summary = "Changed outside the snapshot";
        store.save("B", { ...snapshot(), view: { ...view, demoData: { summary: "Result B" } } });
        expect(store.read("A")?.view.demoData.summary).toBe("Original cached summary");
        expect(store.read("B")?.view.demoData.summary).toBe("Result B");
        for (let i = 0; i < 8; i++) store.save(`next-${i}`, snapshot());
        expect(store.read("A")).toBeUndefined();
        expect(store.read("B")).toBeUndefined();
    });

    it("retains the same identity across refresh and purges snapshots on logout/account change", () => {
        const { rerender } = render(<ClinicalResultSessionProvider><Probe /></ClinicalResultSessionProvider>);
        store.save("A", snapshot());
        const oldStore = store;
        rerender(<ClinicalResultSessionProvider><Probe /></ClinicalResultSessionProvider>);
        expect(store.read("A")).toBeDefined();
        auth.user.id = "synthetic-user-b";
        rerender(<ClinicalResultSessionProvider><Probe /></ClinicalResultSessionProvider>);
        expect(store.read("A")).toBeUndefined();
        expect(oldStore.read("A")).toBeUndefined();
        store.save("B", snapshot());
        auth.status = "unauthenticated";
        rerender(<ClinicalResultSessionProvider><Probe /></ClinicalResultSessionProvider>);
        expect(store.read("B")).toBeUndefined();
    });
});
