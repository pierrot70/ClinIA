import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ClinicalDemoResult from "./ClinicalDemoResult";
import TreatmentDetails from "../pages/TreatmentDetails";
import Results from "../pages/Results";
import { ClinicalResultReturnProvider } from "../contexts/ClinicalResultReturnContext";
import { ClinicalAnalysisNavigationProvider } from "../contexts/ClinicalAnalysisNavigationContext";
// @ts-ignore Exercise the production cache contract across the JS/TS boundary.
import { resolveCachedDiagnosisState } from "../../../backend/services/aiAnalyzeCacheService.js";
// @ts-ignore Exercise the production normalizer, not a frontend facsimile.
import { normalizeClinicalAnalysis, extractPrimaryClinicalConcern, isPlaceholderClinicalAnalysis } from "../../../backend/utils/clinicalAnalysis.js";

const transport = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../services/authService", () => ({ authFetch: transport.fetch }));
afterEach(() => transport.fetch.mockReset());

// Minimal reconstructed fiction matching the three observed historical shapes.
// Names/container keys follow those shapes; all explanatory text below is an
// authored sentinel, not a complete provider response or clinical guidance.
// No document IDs, cache fingerprints, credentials, or patient records are used.
const currentStrategy = {
    description: "Unnamed current strategy sentinel",
    rationale: "Unnamed current strategy rationale sentinel",
};
const historicalCases = [
    {
        id: "DT2-55", age: 55,
        options: {
            current_strategy: currentStrategy,
            additional_options: [
                { class: "GLP-1 receptor agonists", considerations: "First array considerations sentinel", suitability: "First suitability sentinel", notes: "First notes sentinel" },
                { class: "SGLT2 inhibitors", considerations: "Second array considerations sentinel", suitability: "Second suitability sentinel", notes: "Second notes sentinel" },
                { class: "Other agents (DPP-4 inhibitors, sulfonylureas, insulin)", considerations: "Third array considerations sentinel" },
            ],
        },
        names: ["GLP-1 receptor agonists", "SGLT2 inhibitors", "Other agents (DPP-4 inhibitors, sulfonylureas, insulin)"],
        firstSource: { class: "GLP-1 receptor agonists", considerations: "First array considerations sentinel", suitability: "First suitability sentinel", notes: "First notes sentinel" },
    },
    {
        id: "DT2-78-LOW-FRAILTY", age: 78,
        options: {
            current_strategy: currentStrategy,
            additional_or_alternative_options: {
                "GLP-1_receptor_agonists": { description: "First dictionary description sentinel", rationale: "First dictionary rationale sentinel", considerations: "First dictionary considerations sentinel" },
                "SGLT2_inhibitors": { description: "Second dictionary description sentinel", rationale: "Second dictionary rationale sentinel", considerations: "Second dictionary considerations sentinel" },
                "Other agents": { description: "Third dictionary description sentinel", rationale: "Third dictionary rationale sentinel" },
            },
        },
        names: ["GLP-1 receptor agonists", "SGLT2 inhibitors", "Other agents"],
        firstSource: { "GLP-1_receptor_agonists": { description: "First dictionary description sentinel", rationale: "First dictionary rationale sentinel", considerations: "First dictionary considerations sentinel" } },
        firstRationale: "First dictionary rationale sentinel",
        firstDescription: "First dictionary description sentinel",
    },
    {
        id: "DT2-CV-58", age: 58,
        options: {
            current_strategy: currentStrategy,
            additional_agents: [
                { class: "GLP-1 receptor agonists", rationale: "First agent rationale sentinel", benefits: "First benefits sentinel", considerations: "First agent considerations sentinel", contraindications: "First agent restriction sentinel" },
                { class: "SGLT2 inhibitors", rationale: "Second agent rationale sentinel", benefits: "Second benefits sentinel", considerations: "Second agent considerations sentinel", contraindications: "Second agent restriction sentinel" },
            ],
        },
        names: ["GLP-1 receptor agonists", "SGLT2 inhibitors"],
        firstSource: { class: "GLP-1 receptor agonists", rationale: "First agent rationale sentinel", benefits: "First benefits sentinel", considerations: "First agent considerations sentinel", contraindications: "First agent restriction sentinel" },
        firstRationale: "First agent rationale sentinel",
        firstRestriction: "First agent restriction sentinel",
    },
];

describe("historical diabetes option shapes through real cache replay and treatment navigation", () => {
    it.each(historicalCases)("$id keeps its authored alternatives, scoped details and provenance", testCase => {
        const input = {
            age: testCase.age, sex: "male" as const, diagnosis: "Type 2 diabetes",
            symptoms: ["Fictional review symptom"], medical_history: [], current_medications: ["Metformin"],
            diabetes_context: { renal_function: "Preserved or mildly reduced", fragility: "Low" },
        };
        const stored = {
            treatments: [],
            patient_summary: { plain_language: "Unsupported historical summary sentinel", clinical_language: "Unsupported historical clinical summary sentinel" },
            other_ai_fields: {
                therapeutic_options: structuredClone(testCase.options),
                monitoring_considerations: { overall: "Analysis-wide monitoring sentinel" },
                contraindications_and_cautions: { unrelated: "Analysis-wide restriction sentinel" },
            },
        };
        const original = structuredClone(stored);
        const cache = resolveCachedDiagnosisState({
            cachedDiagnosis: { input, output: stored, mode: "real", model: "isolated-historical-fiction" },
            model: "isolated-historical-fiction", forceRealSafe: false, useMock: false,
            normalizeClinicalAnalysis, extractPrimaryClinicalConcern, isPlaceholderClinicalAnalysis,
        });
        expect(cache.canReuseCachedDiagnosis).toBe(true);
        expect(cache.cacheNeedsUpgrade).toBe(false);
        const result = cache.normalizedCachedOutput;
        expect(result.treatments.map((item: { name: string }) => item.name)).toEqual(testCase.names);
        expect(result.summary_safety?.status).toBe("withheld");
        expect(result.other_ai_fields.therapeutic_options).toEqual(original.other_ai_fields.therapeutic_options);
        expect(result.treatments[0].source_fields).toEqual(testCase.firstSource);
        for (const option of result.treatments) {
            expect(option.monitoring).toEqual([]);
            expect(option.contraindications).not.toContain("Analysis-wide restriction sentinel");
        }
        if (testCase.firstRestriction) expect(result.treatments[0].contraindications).toEqual([testCase.firstRestriction]);

        const view = { demoData: { ...result, summary: result.patient_summary?.plain_language }, patientContext: input, sourceMode: "real", cacheHit: true };
        render(<ClinicalResultReturnProvider><ClinicalAnalysisNavigationProvider><MemoryRouter>
            <Routes>
                <Route path="/" element={<ClinicalDemoResult {...view} alternativesInitiallyOpen />} />
                <Route path="/treatment/:id" element={<TreatmentDetails />} />
                <Route path="/results" element={<Results />} />
            </Routes>
        </MemoryRouter></ClinicalAnalysisNavigationProvider></ClinicalResultReturnProvider>);

        const assertCards = () => {
            expect(screen.getAllByRole("link", { name: "Détails" })).toHaveLength(testCase.names.length);
            for (const name of testCase.names) expect(screen.getByRole("heading", { name })).toHaveAttribute("translate", "no");
            expect(screen.getAllByText("Réponse réutilisée depuis le cache.")).toHaveLength(testCase.names.length);
            expect(screen.getAllByText("Base sur une reponse OpenAI reelle")).toHaveLength(testCase.names.length);
            expect(screen.queryByText(/Aucune option thérapeutique structurée/)).not.toBeInTheDocument();
            expect(screen.queryByRole("heading", { name: currentStrategy.description })).not.toBeInTheDocument();
            expect(screen.queryByRole("heading", { name: "Metformin" })).not.toBeInTheDocument();
        };
        assertCards();
        fireEvent.click(screen.getByRole("button", { name: /^Résumé clinique du patient/ }));
        expect(screen.getByRole("status")).toHaveTextContent("contrôle glycémique");
        expect(screen.getByText("Preserved or mildly reduced")).toHaveAttribute("translate", "no");
        expect(screen.queryByText("Unsupported historical summary sentinel")).not.toBeInTheDocument();
        expect(screen.queryByText("Unsupported historical clinical summary sentinel")).not.toBeInTheDocument();

        fireEvent.click(screen.getAllByRole("link", { name: "Détails" })[0]);
        expect(screen.getByRole("heading", { name: testCase.names[0] })).toBeInTheDocument();
        expect(screen.getByText((_, element) => element?.tagName === "PRE" && element.textContent === JSON.stringify(testCase.firstSource, null, 2))).toHaveAttribute("translate", "no");
        if (testCase.firstRationale) expect(screen.getByText(testCase.firstRationale)).toHaveAttribute("translate", "no");
        if (testCase.firstDescription) expect(screen.getByText(testCase.firstDescription)).toHaveAttribute("translate", "no");
        if (testCase.firstRestriction) expect(screen.getByText(testCase.firstRestriction)).toHaveAttribute("translate", "no");
        expect(screen.queryByText("Analysis-wide monitoring sentinel")).not.toBeInTheDocument();
        expect(screen.queryByText("Analysis-wide restriction sentinel")).not.toBeInTheDocument();
        expect(screen.queryByText("Second agent restriction sentinel")).not.toBeInTheDocument();
        expect(screen.getByText("Réponse réutilisée depuis le cache.")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("link", { name: "← Retour aux résultats" }));
        assertCards();
        fireEvent.click(screen.getByRole("button", { name: /^Résumé clinique du patient/ }));
        expect(screen.getByRole("status")).toHaveTextContent("contrôle glycémique");
        expect(screen.queryByText("Unsupported historical summary sentinel")).not.toBeInTheDocument();
        expect(stored).toEqual(original);
        expect(transport.fetch.mock.calls.filter(([url]) => String(url).includes("/api/ai/analyze"))).toHaveLength(0);
    });
});
