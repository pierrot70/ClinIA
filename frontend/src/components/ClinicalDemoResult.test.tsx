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
    default: ({
        question,
        answer,
    }: {
        question: string;
        answer: string;
    }) => (
        <div data-testid="question-card">
            <div>{question}</div>
            <div>{answer}</div>
        </div>
    ),
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

    it("renders contextual clinical questions when summary and treatments are available", () => {
        render(
            <ClinicalDemoResult
                demoData={{
                    summary:
                        "Patient a haut risque cardio-renal avec hyperglycemie persistante et surveillance rapprochee recommande.",
                    treatments: [
                        {
                            name: "Inhibiteur SGLT2",
                            indication:
                                "Option a discuter selon le profil cardio-renal et la tolerance actuelle.",
                            dosage: "Selon evaluation clinique",
                            duration: "A discuter",
                            contraindications: ["Hypovolemie"],
                            monitoring: ["Fonction renale", "Hydratation"],
                            evidence_level: "A",
                        },
                    ],
                    questions: [
                        {
                            question: "Question simulee",
                            answer: "Reponse simulee",
                        },
                    ],
                }}
            />
        );

        expect(
            screen.getByText("Questions cliniques contextuelles")
        ).toBeInTheDocument();
        expect(
            screen.getByText("Quel est le profil clinique principal retenu ici ?")
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Pourquoi Inhibiteur SGLT2 ressort-il comme option a discuter/)
        ).toBeInTheDocument();
        expect(
            screen.queryByText("Questions fréquentes (simulation)")
        ).not.toBeInTheDocument();
    });
});
