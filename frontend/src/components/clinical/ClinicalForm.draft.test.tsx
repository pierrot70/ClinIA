import React, { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { ClinicalForm } from "./ClinicalForm";
import { ClinicalAnalyzePage } from "../../pages/ClinicalAnalyzePage";
import { ClinicalAnalysisNavigationProvider } from "../../contexts/ClinicalAnalysisNavigationContext";
import { ClinicalResultSessionProvider } from "../../contexts/ClinicalResultReturnContext";
import { HomeI18nContext } from "../../contexts/HomeI18nContext";
import type { ClinicalPayload } from "../../types/clinical";

const mocks = vi.hoisted(() => ({
    auth: { status: "authenticated", isAuthenticated: true, user: { id: "synthetic-a", role: "MEDECIN" } },
    analyze: vi.fn(), origin: vi.fn(), reset: vi.fn(), patients: vi.fn(), patient: vi.fn(), update: vi.fn(),
}));
vi.mock("../../hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("../../hooks/useClinicalAnalysis", () => ({ useClinicalAnalysis: () => ({
    result: null, loading: false, error: null, errorCode: null, errorFields: [], responseMeta: null,
    analyze: mocks.analyze, resetAnalysis: mocks.reset,
}) }));
vi.mock("../../services/patientsApi", () => ({
    fetchPatientsPaginated: (...args: unknown[]) => mocks.patients(...args),
    fetchPatientById: (...args: unknown[]) => mocks.patient(...args),
    updatePatient: (...args: unknown[]) => mocks.update(...args),
}));
vi.mock("../../services/clinicalTermsApi", () => ({
    listApprovedClinicalTerms: async () => ({ data: [] }), createClinicalTermRequest: vi.fn(),
}));
const raw = "  Pas de fièvre,  sin dolor — 2,5 mg  ";
const correction: ClinicalPayload = { age: 39, sex: "female", diagnosis: "Correction originale", symptoms: ["Correction"], medical_history: [], current_medications: [] };
function Navigation() {
    const navigate = useNavigate();
    return <><Link to="/away">Away</Link><button onClick={() => navigate(-1)}>Browser back</button><Link to="/clinical">Clinical alias</Link></>;
}
function Harness({ page = false, initialData, allowDraftPersistence, strict = false }: { page?: boolean; initialData?: ClinicalPayload; allowDraftPersistence?: boolean; strict?: boolean }) {
    const form = page ? <ClinicalAnalyzePage /> : <ClinicalForm loading={false} onSubmit={mocks.analyze}
        initialData={initialData} restoreInitialDataForCorrection={Boolean(initialData)} allowDraftPersistence={allowDraftPersistence} onDraftOriginChange={mocks.origin} />;
    const content = <MemoryRouter initialEntries={["/clinical-demo"]}><Navigation />
        <HomeI18nContext.Provider value={{ locale: "fr-CA" } as React.ContextType<typeof HomeI18nContext>}>
            <ClinicalResultSessionProvider><ClinicalAnalysisNavigationProvider><Routes>
                <Route path="/clinical-demo" element={form} /><Route path="/clinical" element={form} />
                <Route path="/away" element={<p>Away page</p>} />
            </Routes></ClinicalAnalysisNavigationProvider></ClinicalResultSessionProvider>
        </HomeI18nContext.Provider></MemoryRouter>;
    return strict ? <StrictMode>{content}</StrictMode> : content;
}
function change(container: HTMLElement, id: string, value: string) {
    const element = container.querySelector("#" + id)!;
    expect(element).toBeTruthy(); fireEvent.change(element, { target: { value } });
}
function fill(container: HTMLElement) {
    change(container, "clinical-field", "generalMedicine");
    change(container, "clinical-example-case", "hypertension55");
    change(container, "clinical-diagnosis", "  Motif original — diagnóstico  ");
    change(container, "clinical-symptoms", raw);
    change(container, "clinical-medical-history", "  Antécédent,  原文  ");
    change(container, "clinical-current-medications", "  Médicament original,  2,5  ");
    change(container, "clinical-age", "63");
    change(container, "clinical-weight", "82.5");
    change(container, "clinical-country", "");
    change(container, "clinical-json-import", "  {\n  \"original\": true\n}  ");
}
function expectDraft(container: HTMLElement) {
    expect(container.querySelector("#clinical-field")).toHaveValue("generalMedicine");
    expect(container.querySelector("#clinical-example-case")).toHaveValue("hypertension55");
    expect(container.querySelector("#clinical-diagnosis")).toHaveValue("  Motif original — diagnóstico  ");
    expect(container.querySelector("#clinical-symptoms")).toHaveValue(raw);
    expect(container.querySelector("#clinical-medical-history")).toHaveValue("  Antécédent,  原文  ");
    expect(container.querySelector("#clinical-current-medications")).toHaveValue("  Médicament original,  2,5  ");
    expect(container.querySelector("#clinical-age")).toHaveValue(63);
    expect(container.querySelector("#clinical-weight")).toHaveValue(82.5);
    expect(container.querySelector("#clinical-country")).toHaveValue("");
    expect(container.querySelector("#clinical-json-import")).toHaveValue("  {\n  \"original\": true\n}  ");
}
beforeEach(() => {
    mocks.auth.status = "authenticated"; mocks.auth.isAuthenticated = true; mocks.auth.user.id = "synthetic-a";
    mocks.analyze.mockReset(); mocks.origin.mockReset(); mocks.patient.mockReset(); mocks.patients.mockReset(); mocks.update.mockReset();
    mocks.patients.mockResolvedValue({ data: { data: [{ _id: "synthetic-patient", prenom: "Synthetic", nom: "Patient" }] } });
    window.localStorage.clear(); window.sessionStorage.clear();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("session-only manual clinical draft", () => {
    it.each([false, true])("restores exact form values after browser navigation without analysis (StrictMode=%s)", strict => {
        const { container } = render(<Harness page strict={strict} />); fill(container);
        fireEvent.click(screen.getByRole("link", { name: "Away" }));
        expect(container.querySelector("#clinical-symptoms")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Browser back" })); expectDraft(container);
        expect(mocks.analyze).not.toHaveBeenCalled();
        expect(window.localStorage.length).toBe(0); expect(window.sessionStorage.length).toBe(0);
    });
    it("shares the manual draft between the two clinical route aliases", () => {
        const { container } = render(<Harness />); fill(container);
        fireEvent.click(screen.getByRole("link", { name: "Away" }));
        fireEvent.click(screen.getByRole("link", { name: "Clinical alias" })); expectDraft(container);
    });
    it.each(["identity", "logout"])("discards the draft on %s and does not restore it when the same user returns", transition => {
        const { container, rerender } = render(<Harness />); fill(container);
        if (transition === "identity") mocks.auth.user.id = "synthetic-b";
        else { mocks.auth.status = "unauthenticated"; mocks.auth.isAuthenticated = false; }
        rerender(<Harness />);
        expect(container.querySelector("#clinical-symptoms")).toBeNull();
        expect(container.querySelector("#clinical-field")).toHaveValue("");
        mocks.auth.user.id = "synthetic-a"; mocks.auth.status = "authenticated"; mocks.auth.isAuthenticated = true;
        rerender(<Harness />);
        expect(container.querySelector("#clinical-symptoms")).toBeNull();
        expect(container.querySelector("#clinical-field")).toHaveValue("");
        expect(mocks.analyze).not.toHaveBeenCalled();
    });
    it("clears all draft fields explicitly without resurrecting them on remount", () => {
        const { container } = render(<Harness />); fill(container);
        fireEvent.click(screen.getByRole("button", { name: "Effacer les donnees patient" }));
        fireEvent.click(screen.getByRole("link", { name: "Away" })); fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
        expect(container.querySelector("#clinical-symptoms")).toBeNull();
        expect(container.querySelector("#clinical-field")).toHaveValue("");
        expect(container.querySelector("#clinical-field")).toHaveValue("");
        expect(container.querySelector("#clinical-json-import")).toBeNull();
        expect(mocks.analyze).not.toHaveBeenCalled();
    });
    it("keeps explicit correction data ahead of an older manual draft without persisting unknown patient origin", () => {
        const { container, rerender } = render(<Harness />); fill(container);
        fireEvent.click(screen.getByRole("link", { name: "Away" }));
        rerender(<Harness initialData={correction} />);
        fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
        expect(container.querySelector("#clinical-diagnosis")).toHaveValue("Correction originale");
        expect(container.querySelector("#clinical-age")).toHaveValue(39);
        change(container, "clinical-symptoms", "Unknown-origin correction edit");
        fireEvent.click(screen.getByRole("link", { name: "Away" })); rerender(<Harness />);
        fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
        expect(container.querySelector("#clinical-symptoms")).toBeNull();
        expect(container.querySelector("#clinical-field")).toHaveValue("");
        expect(container.querySelector("#clinical-diagnosis")).toBeNull();
    });
    it("preserves exact raw lists when correcting the same known manual submission", async () => {
        const { container, rerender } = render(<Harness />); fill(container);
        fireEvent.click(screen.getByRole("button", { name: "Analyser" }));
        await waitFor(() => expect(mocks.analyze).toHaveBeenCalledTimes(1));
        const submitted = mocks.analyze.mock.calls[0][0];
        fireEvent.click(screen.getByRole("link", { name: "Away" }));
        rerender(<Harness initialData={{ ...submitted, forceReal: false, openaiModel: "test-model" }} allowDraftPersistence />);
        fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
        expectDraft(container);
        expect(mocks.analyze).toHaveBeenCalledTimes(1);
    });
    it("does not relabel a patient or unknown correction as manual after repeated submissions", async () => {
        const { container, rerender } = render(<Harness initialData={correction} />);
        for (let call = 1; call <= 2; call += 1) {
            fireEvent.click(screen.getByRole("button", { name: "Analyser" }));
            await waitFor(() => expect(mocks.analyze).toHaveBeenCalledTimes(call));
        }
        expect(mocks.origin.mock.calls).toEqual([[false], [false]]);
        fireEvent.click(screen.getByRole("link", { name: "Away" })); rerender(<Harness />);
        fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
        expect(container.querySelector("#clinical-diagnosis")).toBeNull();
    });
    it("clears manual draft when switching to patient mode and ignores a late patient response after returning manual", async () => {
        let resolve: (value: unknown) => void = () => {};
        mocks.patient.mockReturnValue(new Promise(done => { resolve = done; }));
        const { container } = render(<Harness />); fill(container);
        fireEvent.click(screen.getByRole("button", { name: "Patient existant" }));
        change(container, "clinical-patient-search", "Synthetic");
        fireEvent.click(await screen.findByRole("button", { name: "Synthetic Patient" }));
        fireEvent.click(screen.getByRole("button", { name: "Saisie manuelle" }));
        await act(async () => resolve({ data: { _id: "synthetic-patient", prenom: "Synthetic", nom: "Patient", secure_request_profile: { clinicalAnalysisParameters: correction } } }));
        expect(screen.queryByText(/Patient sélectionné:/)).not.toBeInTheDocument();
        expect(container.querySelector("#clinical-diagnosis")).toBeNull();
        change(container, "clinical-field", "generalMedicine");
        change(container, "clinical-example-case", "hypertension55");
        change(container, "clinical-symptoms", "New manual context");
        fireEvent.click(screen.getByRole("link", { name: "Away" })); fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
        expect(container.querySelector("#clinical-symptoms")).toHaveValue("New manual context");
        expect(container.querySelector("#clinical-diagnosis")).not.toHaveValue("Correction originale");
        expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.analyze).not.toHaveBeenCalled();
    });
});
