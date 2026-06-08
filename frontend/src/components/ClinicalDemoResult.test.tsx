import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ClinicalDemoResult from "./ClinicalDemoResult";
import { HomeI18nContext } from "../contexts/HomeI18nContext";

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
    it("renders result titles in Spanish", () => {
        render(
            <HomeI18nContext.Provider value={{ locale: "es" } as any}>
                <ClinicalDemoResult
                    demoData={{
                        summary: "Resumen generado",
                        treatments: [],
                        questions: [],
                    }}
                />
            </HomeI18nContext.Provider>
        );

        expect(
            screen.getByRole("button", { name: /Resumen clínico del paciente/i })
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: /Preguntas clínicas para explorar/i })
        ).toBeInTheDocument();
    });

    it("uses English inside opened sections for a non-French locale", () => {
        render(
            <HomeI18nContext.Provider value={{ locale: "es" } as any}>
                <ClinicalDemoResult
                    demoData={{
                        clinical_summary: "Clinical content",
                        recommendations: "Recommendation content",
                        other_ai_fields: { note: "Additional content" },
                    }}
                />
            </HomeI18nContext.Provider>
        );

        fireEvent.click(
            screen.getByRole("button", { name: /Resumen clínico del paciente/i })
        );
        expect(screen.getByText("AI clinical summary")).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", { name: /Alternativas y recomendaciones/i })
        );
        expect(screen.getByText("AI recommendations")).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", { name: /Preguntas clínicas para explorar/i })
        );
        expect(screen.getByText("Other AI recommendations")).toBeInTheDocument();
    });

    it("uses deterministic English labels for simulated result content", () => {
        render(
            <HomeI18nContext.Provider value={{ locale: "en-CA" } as any}>
                <ClinicalDemoResult
                    demoData={{
                        treatments: [
                            {
                                name: "Metformine",
                                indication: "Option clinique.",
                                dosage: "Selon le contexte",
                                duration: "A discuter",
                                contraindications: [],
                                monitoring: [],
                                evidence_level: "A",
                            },
                        ],
                        questions: [],
                    }}
                />
            </HomeI18nContext.Provider>
        );

        fireEvent.click(
            screen.getByRole("button", { name: /Alternatives and recommendations/i })
        );
        expect(screen.getByText("Suggested treatment")).toBeInTheDocument();
        expect(
            screen.getByText(/is presented as a priority option to discuss/)
        ).toBeInTheDocument();
        expect(screen.queryByText(/est présenté comme option prioritaire/)).not.toBeInTheDocument();
    });

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

        fireEvent.click(
            screen.getByRole("button", {
                name: /Résumé clinique du patient/i,
            })
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

        fireEvent.click(
            screen.getByRole("button", {
                name: /Questions cliniques à explorer/i,
            })
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

    it("keeps the JSON copy action available when the OpenAI request fails", () => {
        const onCopyRequest = vi.fn();

        render(
            <ClinicalDemoResult
                demoData={{
                    error: "OpenAI indisponible",
                    errorCode: "OPENAI_ANALYZE_SATURATED",
                }}
                canCopyRequest={true}
                onCopyRequest={onCopyRequest}
            />
        );

        expect(screen.getByText("Erreur d'analyse IA")).toBeInTheDocument();
        expect(
            screen.getByRole("button", {
                name: /Résumé clinique du patient/i,
            })
        ).toHaveAttribute("aria-expanded", "true");

        fireEvent.click(
            screen.getByRole("button", { name: "Copier la requete JSON" })
        );
        expect(onCopyRequest).toHaveBeenCalledTimes(1);
    });
});
