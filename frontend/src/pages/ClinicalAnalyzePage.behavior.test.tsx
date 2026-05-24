import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const analyzeMock = vi.fn();
const clinicalFormSpy = vi.fn();
const hookSlots: any[] = [];
let useClinicalAnalysisCallIndex = 0;
let authUser: any = null;

vi.mock("../components/clinical/ClinicalForm", () => ({
    ClinicalForm: (props: any) => {
        clinicalFormSpy(props);

        return (
            <div>
                <button
                    type="button"
                    onClick={() =>
                        props.onSubmit({
                            age: 55,
                            sex: "male",
                            diagnosis: "cancer gastrique",
                            symptoms: [],
                            medical_history: ["cancer", "cancer de l'estomac"],
                            current_medications: [],
                        })
                    }
                >
                    submit-clinical-form
                </button>
                <button
                    type="button"
                    onClick={() =>
                        props.onCompareSubmit?.(
                            {
                                age: 55,
                                sex: "male",
                                diagnosis: "Diabete de type 2",
                                symptoms: ["Fatigue"],
                                medical_history: ["Hypertension arterielle"],
                                current_medications: ["Metformine"],
                                diabetes_context: {
                                    cardiovascular_risk: "Modere a eleve",
                                    renal_function: "Preservee ou legerement reduite",
                                    fragility: "Faible",
                                },
                            },
                            {
                                age: 79,
                                sex: "female",
                                diagnosis: "Diabete de type 2",
                                symptoms: ["Perte de poids"],
                                medical_history: ["Insuffisance renale chronique"],
                                current_medications: ["Metformine"],
                                diabetes_context: {
                                    cardiovascular_risk: "Tres eleve",
                                    renal_function: "Reduction moderee a importante",
                                    fragility: "Elevee",
                                },
                            }
                        )
                    }
                >
                    compare-clinical-form
                </button>
            </div>
        );
    },
}));

vi.mock("../components/ClinicalDemoResult", () => ({
    default: () => <div data-testid="clinical-demo-result" />,
}));

vi.mock("../hooks/useClinicalAnalysis", () => ({
    useClinicalAnalysis: () => {
        const slot = hookSlots[useClinicalAnalysisCallIndex % 3];
        useClinicalAnalysisCallIndex += 1;
        return slot;
    },
}));

vi.mock("../hooks/useTranslation", () => ({
    useTranslation: ({ text }: { text: string }) => ({
        translated: text,
        loading: false,
        error: null,
    }),
}));

vi.mock("../contexts/HomeI18nContext", () => ({
    HomeI18nContext: {
        Provider: ({ children }: { children: React.ReactNode }) => children,
        Consumer: ({ children }: { children: (value: { locale: string }) => React.ReactNode }) =>
            children({ locale: "fr" }),
        _currentValue: { locale: "fr" },
    },
}));

vi.mock("../services/securityIncidentApi", () => ({
    acknowledgeSecurityIncident: vi.fn(),
    REQUIRED_ACK_ACTION: "J'ai lu et compris",
}));

vi.mock("../components/system/SecurityBlockingAlert", () => ({
    SecurityBlockingAlert: () => null,
}));

vi.mock("../components/ClinicalRelevanceByAgeChart", () => ({
    default: ({ title, subtitle }: { title: string; subtitle: string }) => (
        <div data-testid="comparison-relevance-chart">
            <div>{title}</div>
            <div>{subtitle}</div>
        </div>
    ),
}));

vi.mock("../contexts/SecurityIncidentContext", () => ({
    useSecurityIncident: () => ({
        blockingIncident: null,
        setBlockingIncident: vi.fn(),
    }),
}));

vi.mock("../hooks/useAuth", () => ({
    useAuth: () => ({
        user: authUser,
    }),
}));

import { ClinicalAnalyzePage } from "./ClinicalAnalyzePage";

describe("ClinicalAnalyzePage", () => {
    function configureClinicalAnalysisSlots(...slots: any[]) {
        useClinicalAnalysisCallIndex = 0;
        hookSlots.length = 0;
        hookSlots.push(...slots);
    }

    it("submits the exact user payload without injecting the demo case", () => {
        analyzeMock.mockReset();
        clinicalFormSpy.mockReset();
        configureClinicalAnalysisSlots(
            {
                result: null,
                loading: false,
                error: null,
                errorCode: null,
                analyze: analyzeMock,
                resetAnalysis: vi.fn(),
            },
            {
                result: null,
                loading: false,
                error: null,
                errorCode: null,
                analyze: vi.fn(),
                resetAnalysis: vi.fn(),
            },
            {
                result: null,
                loading: false,
                error: null,
                errorCode: null,
                analyze: vi.fn(),
                resetAnalysis: vi.fn(),
            }
        );

        render(
            <MemoryRouter>
                <ClinicalAnalyzePage />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByRole("button", { name: "submit-clinical-form" }));

        expect(clinicalFormSpy).toHaveBeenCalled();
        expect(clinicalFormSpy.mock.calls[0][0].initialData).toBeUndefined();
        expect(analyzeMock).toHaveBeenCalledWith({
            age: 55,
            sex: "male",
            diagnosis: "cancer gastrique",
            symptoms: [],
            medical_history: ["cancer", "cancer de l'estomac"],
            current_medications: [],
            forceReal: false,
            openaiModel: "gpt-4.1-mini",
        });
    });

    it("shows two age relevance charts in visual comparison mode", async () => {
        const compareAnalyzeOne = vi.fn();
        const compareAnalyzeTwo = vi.fn();

        analyzeMock.mockReset();
        clinicalFormSpy.mockReset();
        authUser = { role: "SUPERADMIN" };
        configureClinicalAnalysisSlots(
            {
                result: null,
                loading: false,
                error: null,
                errorCode: null,
                analyze: analyzeMock,
                resetAnalysis: vi.fn(),
            },
            {
                result: {
                    patient_summary: {
                        plain_language: "Resume cas 1",
                    },
                },
                loading: false,
                error: null,
                errorCode: null,
                analyze: compareAnalyzeOne,
                resetAnalysis: vi.fn(),
            },
            {
                result: {
                    patient_summary: {
                        plain_language: "Resume cas 2",
                    },
                },
                loading: false,
                error: null,
                errorCode: null,
                analyze: compareAnalyzeTwo,
                resetAnalysis: vi.fn(),
            }
        );

        render(
            <MemoryRouter>
                <ClinicalAnalyzePage />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByRole("button", { name: "compare-clinical-form" }));

        expect(compareAnalyzeOne).toHaveBeenCalled();
        expect(compareAnalyzeTwo).toHaveBeenCalled();
        expect(
            screen.getByRole("button", {
                name: "Relancer pour verification (SUPERADMIN)",
            })
        ).toBeInTheDocument();
        expect(
            screen.getByText("Lecture rapide des differences cliniques")
        ).toBeInTheDocument();
        expect(screen.getByText("Risque cardio-renal")).toBeInTheDocument();
        expect(screen.getByText("Contraste marque")).toBeInTheDocument();
        expect(screen.getAllByText("Point de vigilance principal")).toHaveLength(2);
        expect(
            screen.getByText(
                "fonction renale a verifier en priorite avant de pondérer les options"
            )
        ).toBeInTheDocument();
        expect(screen.getAllByText("Micro-synthese scannable")).toHaveLength(2);
        expect(
            screen.getByText("Priorite: privilegier la lecture du benefice cardio-renal")
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "Place clinique relative selon l'age et le contexte - comparaison visuelle"
            )
        ).toBeInTheDocument();
        expect(screen.getAllByTestId("comparison-relevance-chart")).toHaveLength(2);

        await act(async () => {
            fireEvent.click(
                screen.getByRole("button", {
                    name: "Relancer pour verification (SUPERADMIN)",
                })
            );
        });

        expect(compareAnalyzeOne).toHaveBeenCalledTimes(2);
        expect(compareAnalyzeTwo).toHaveBeenCalledTimes(2);
        expect(compareAnalyzeOne).toHaveBeenLastCalledWith(
            expect.objectContaining({
                reverifyRequested: true,
                forceReal: true,
                openaiModel: "gpt-4.1-mini",
            })
        );
        expect(compareAnalyzeTwo).toHaveBeenLastCalledWith(
            expect.objectContaining({
                reverifyRequested: true,
                forceReal: true,
                openaiModel: "gpt-4.1-mini",
            })
        );

        authUser = null;
    });
});
