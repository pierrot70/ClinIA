import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ClinicalDemoResult from "./ClinicalDemoResult";
import { HomeI18nContext } from "../contexts/HomeI18nContext";

const { captureTreatmentTable, captureQuestionCard } = vi.hoisted(() => ({ captureTreatmentTable: vi.fn(), captureQuestionCard: vi.fn() }));

vi.mock("./AITreatmentTable", () => ({
    default: (props: unknown) => {
        captureTreatmentTable(props);
        return <div data-testid="ai-treatment-table" />;
    },
}));

vi.mock("./TreatmentCard", () => ({
    default: () => <div data-testid="treatment-card" />,
}));

vi.mock("./QuestionCard", () => ({
    default: (props: { question: string; answer: string; language: string }) => {
        captureQuestionCard(props);
        return <div data-testid="question-card"><div>{props.question}</div><div>{props.answer}</div></div>;
    },
}));

vi.mock("./ClinicalRelevanceByAgeChart", () => ({
    default: () => <div data-testid="clinical-relevance-chart" />,
}));

describe("ClinicalDemoResult", () => {
    it("passes the selected locale to contextual questions after switching from English to Spanish", () => {
        const data = { summary: "Synthetic summary", treatments: [{ name: "Inhibiteur SGLT2" }], questions: [] };
        const view = (locale: string) => <HomeI18nContext.Provider value={{ locale } as any}><ClinicalDemoResult demoData={data as any} /></HomeI18nContext.Provider>;
        const { rerender } = render(view("en-CA"));
        fireEvent.click(screen.getByRole("button", { name: /Clinical questions to explore/i }));
        expect(captureQuestionCard.mock.lastCall![0].language).toBe("en-CA");
        rerender(view("es"));
        expect(screen.getByText("Preguntas clínicas contextuales")).toBeInTheDocument();
        expect(captureQuestionCard.mock.lastCall![0]).toMatchObject({ language: "es", question: "¿Por qué Inhibiteur SGLT2 destaca como opción para discutir?" });
        expect(screen.queryByText("Contextual clinical questions")).not.toBeInTheDocument();
    });

    it("keeps treatment indicators out of contraindications and preserves listed contraindications", () => {
        render(<HomeI18nContext.Provider value={{ locale: "en-CA" } as any}>
            <ClinicalDemoResult demoData={{ treatments: [
                { name: "Synthetic option A", flags: ["wellTolerated", "monitoring"] },
                { name: "Synthetic option B", flags: ["wellTolerated"], contraindications: ["Listed contraindication"] },
            ], questions: [] } as any} />
        </HomeI18nContext.Provider>);
        fireEvent.click(screen.getByRole("button", { name: /Alternatives and recommendations/i }));
        const { treatments } = captureTreatmentTable.mock.lastCall![0];
        expect(treatments[0].contraindications).toEqual([]);
        expect(treatments[0].flags).toEqual(["wellTolerated", "monitoring"]);
        expect(treatments[1].contraindications).toEqual(["Listed contraindication"]);
    });
    it.each([{}, { clinical_summary: "Additional clinical details" }, { treatments: [{ name: "Treatment A" }] }])("shows alternatives and red flags immediately in every result layout: %j", layout => {
        render(<HomeI18nContext.Provider value={{ locale: "en-CA" } as any}>
            <ClinicalDemoResult demoData={{ ...layout, alternatives: [{ name: "Alternative A", reason: "Consider patient context." }], red_flags: ["Urgent assessment required."] } as any} />
        </HomeI18nContext.Provider>);
        expect(screen.getByRole("heading", { name: "Therapeutic alternatives" })).toBeVisible();
        expect(screen.getByRole("heading", { name: "Red flags" })).toBeVisible();
        expect(screen.getByText("Alternative A")).toBeVisible();
        expect(screen.getByText("Consider patient context.")).toBeVisible();
        expect(screen.getByText("Urgent assessment required.")).toBeVisible();
    });
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

    it("uses Spanish inside opened sections when Spanish is selected", () => {
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
        expect(screen.getByText("Resumen clínico de IA")).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", { name: /Alternativas y recomendaciones/i })
        );
        expect(screen.getByText("Recomendaciones de IA")).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", { name: /Preguntas clínicas para explorar/i })
        );
        expect(screen.getByText("Otras recomendaciones de IA")).toBeInTheDocument();
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
                name: "Copier la requête JSON",
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
            screen.getByText(/Pourquoi Inhibiteur SGLT2 ressort-il comme option à discuter/)
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
            screen.getByRole("button", { name: "Copier la requête JSON" })
        );
        expect(onCopyRequest).toHaveBeenCalledTimes(1);
    });

    it("renders a legacy cached result without assuming list-shaped fields", () => {
        render(
            <ClinicalDemoResult
                demoData={{
                    summary: "A previously saved clinical summary.",
                    treatments: { legacy: true } as any,
                    questions: { legacy: true } as any,
                }}
            />
        );

        expect(
            screen.getByRole("button", { name: /Résumé clinique du patient/i })
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: /Questions cliniques à explorer/i })
        ).toBeInTheDocument();
    });

    it("renders a structured clinical summary returned by OpenAI", () => {
        render(
            <ClinicalDemoResult
                demoData={{
                    treatments: [],
                    clinical_summary: {
                        assessment: "Hypertension requires follow-up.",
                    } as any,
                }}
            />
        );

        fireEvent.click(
            screen.getByRole("button", { name: /Résumé clinique du patient/i })
        );

        expect(
            screen.getByText(/Hypertension requires follow-up/)
        ).toBeInTheDocument();
    });
});
