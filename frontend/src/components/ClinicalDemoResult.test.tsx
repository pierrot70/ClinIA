import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ClinicalDemoResult from "./ClinicalDemoResult";

vi.mock("./AITreatmentTable", () => ({
    default: () => <div data-testid="ai-treatment-table" />,
}));

vi.mock("./TreatmentCard", () => ({
    default: () => <div data-testid="treatment-card" />,
}));

vi.mock("./QuestionCard", () => ({
    default: () => <div data-testid="question-card" />,
}));

vi.mock("./ClinicalRelevanceByAgeChart", () => ({
    default: () => <div data-testid="clinical-relevance-chart" />,
}));

describe("ClinicalDemoResult", () => {
    it("shows the reverify button only when allowed", () => {
        const demoData = {
            summary: "Resume genere",
            treatments: [],
            questions: [],
        };

        const { rerender } = render(
            <ClinicalDemoResult demoData={demoData} />
        );

        expect(
            screen.queryByRole("button", {
                name: "Relancer pour verification (SUPERADMIN)",
            })
        ).not.toBeInTheDocument();

        rerender(
            <ClinicalDemoResult
                demoData={demoData}
                canReverify={true}
                onReverify={() => {}}
                canCopyRequest={true}
                onCopyRequest={() => {}}
            />
        );

        expect(
            screen.getByRole("button", {
                name: "Relancer pour verification (SUPERADMIN)",
            })
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", {
                name: "Copier la requete JSON",
            })
        ).toBeInTheDocument();
    });
});
