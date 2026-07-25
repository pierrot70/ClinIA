import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const analyzeMock = vi.fn();
const clinicalFormSpy = vi.fn();
const hookSlots: any[] = [];
let useClinicalAnalysisCallIndex = 0;
let authUser: any = null;
const { acknowledgeSecurityIncidentMock } = vi.hoisted(() => ({
    acknowledgeSecurityIncidentMock: vi.fn(),
}));

vi.mock("../components/clinical/ClinicalForm", () => ({
    ClinicalForm: (props: any) => {
        clinicalFormSpy(props);

        return (
            <div>
                <input id="clinical-diagnosis" aria-label="clinical-diagnosis" />
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
    acknowledgeSecurityIncident: acknowledgeSecurityIncidentMock,
    REQUIRED_ACK_ACTION: "J'ai lu et compris",
}));

vi.mock("../components/system/SecurityBlockingAlert", () => ({
    SecurityBlockingAlert: ({ onAcknowledge }: { onAcknowledge: () => void }) => (
        <button type="button" onClick={onAcknowledge}>
            acknowledge-blocking-incident
        </button>
    ),
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
    beforeEach(() => {
        authUser = null;
    });

    function configureClinicalAnalysisSlots(...slots: any[]) {
        useClinicalAnalysisCallIndex = 0;
        hookSlots.length = 0;
        hookSlots.push(...slots);
    }

    it("submits the exact user payload without injecting the demo case", () => {
        analyzeMock.mockReset();
        clinicalFormSpy.mockReset();
        authUser = { role: "MEDECIN" };
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
        expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Mode simulation" })
        ).not.toBeInTheDocument();
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

    it("replays the same clinical payload with the acknowledged incident ID", async () => {
        const blockingIncident = {
            required: true,
            incident: {
                id: "incident-123",
                type: "NON_SECURE_CONTENT",
                reason: "Potential identifier detected.",
                phase: "pre_cloud",
                timestamp: "2026-07-25T10:00:00.000Z",
                context: {},
                matches: [],
                sanitizationPreview: {
                    symptoms: ["Cephalee"],
                },
            },
            acknowledgment: {
                requiredAction: "J'ai lu et compris",
                method: "POST" as const,
                endpoint: "/api/security/incidents/acknowledge",
            },
            userMessage: "Analyse bloquee.",
        };
        const replayAnalyze = vi
            .fn()
            .mockResolvedValueOnce(blockingIncident)
            .mockResolvedValueOnce(null);
        acknowledgeSecurityIncidentMock.mockReset();
        acknowledgeSecurityIncidentMock.mockResolvedValue({
            data: { incidentId: "incident-123", acknowledged: true },
        });
        authUser = { role: "MEDECIN" };
        configureClinicalAnalysisSlots(
            {
                result: null,
                loading: false,
                error: null,
                errorCode: null,
                errorFields: [],
                analyze: replayAnalyze,
                resetAnalysis: vi.fn(),
            },
            {
                result: null,
                loading: false,
                error: null,
                errorCode: null,
                errorFields: [],
                analyze: vi.fn(),
                resetAnalysis: vi.fn(),
            },
            {
                result: null,
                loading: false,
                error: null,
                errorCode: null,
                errorFields: [],
                analyze: vi.fn(),
                resetAnalysis: vi.fn(),
            }
        );

        render(
            <MemoryRouter>
                <ClinicalAnalyzePage />
            </MemoryRouter>
        );

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "submit-clinical-form" }));
        });
        await act(async () => {
            fireEvent.click(
                screen.getByRole("button", { name: "acknowledge-blocking-incident" })
            );
        });

        expect(acknowledgeSecurityIncidentMock).toHaveBeenCalledWith(
            expect.objectContaining({ incidentId: "incident-123" })
        );
        expect(replayAnalyze).toHaveBeenCalledTimes(1);

        expect(screen.getByText("Verification avant transmission")).toBeInTheDocument();
        expect(screen.getByText("Valeur originale:")).toBeInTheDocument();
        expect(screen.getByText("Valeur corrigee:")).toBeInTheDocument();

        await act(async () => {
            fireEvent.click(
                screen.getByRole("button", {
                    name: "Continuer avec les parametres corriges",
                })
            );
        });
        expect(replayAnalyze).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ incidentAckId: "incident-123" })
        );
    });

    it("returns to the form and focuses the first rejected cloud-bound field", async () => {
        const resetAnalysis = vi.fn();
        authUser = { role: "MEDECIN" };
        configureClinicalAnalysisSlots(
            {
                result: null,
                loading: false,
                error: "Le texte libre demeure dans ClinIA.",
                errorCode: "UNAPPROVED_CLOUD_CLINICAL_CONTENT",
                errorFields: ["diagnosis", "symptoms"],
                analyze: vi.fn(),
                resetAnalysis,
            },
            {
                result: null,
                loading: false,
                error: null,
                errorCode: null,
                errorFields: [],
                analyze: vi.fn(),
                resetAnalysis: vi.fn(),
            },
            {
                result: null,
                loading: false,
                error: null,
                errorCode: null,
                errorFields: [],
                analyze: vi.fn(),
                resetAnalysis: vi.fn(),
            }
        );

        render(
            <MemoryRouter>
                <ClinicalAnalyzePage />
            </MemoryRouter>
        );

        expect(
            screen.getByRole("alert", {
                name: "Analyse interrompue avant transmission",
            })
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                /Diagnostic ou motif clinique principal, Symptomes principaux/
            )
        ).toBeInTheDocument();
        expect(screen.queryByText(/contenu libre confidentiel/i)).not.toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", { name: "Corriger les parametres" })
        );
        expect(resetAnalysis).toHaveBeenCalledTimes(1);
        await act(async () => {
            await new Promise((resolve) => window.setTimeout(resolve, 0));
        });
        expect(screen.getByLabelText("clinical-diagnosis")).toHaveFocus();
    });

    it("shows model and simulation controls to administrators", () => {
        authUser = { role: "ADMIN" };
        configureClinicalAnalysisSlots(
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

        expect(screen.getByRole("combobox")).toHaveValue("gpt-4.1-mini");
        expect(
            screen.getByRole("button", { name: "Mode simulation" })
        ).toBeInTheDocument();

        const commentToggle = screen.getByRole("button", {
            name: "Laisser un commentaire",
        });
        const repliesToggle = screen.getByRole("button", {
            name: "Voir les réponses à mes commentaires",
        });

        expect(commentToggle).toHaveAttribute("aria-expanded", "false");
        expect(repliesToggle).toHaveAttribute("aria-expanded", "false");
        expect(
            screen.queryByRole("link", { name: "Laisser un commentaire" })
        ).not.toBeInTheDocument();

        fireEvent.click(commentToggle);
        fireEvent.click(repliesToggle);

        expect(commentToggle).toHaveAttribute("aria-expanded", "true");
        expect(repliesToggle).toHaveAttribute("aria-expanded", "true");
        expect(
            screen.getByRole("link", { name: "Laisser un commentaire" })
        ).toBeInTheDocument();
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
            screen.getAllByText("Lecture rapide des differences cliniques").length
        ).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("Lecture mobile essentielle")).toBeInTheDocument();
        expect(
            screen.getAllByText(
                "Ouvrez le detail complet pour consulter les differences cliniques, les points de vigilance et le raisonnement sous-jacent."
            )
        ).toHaveLength(2);
        fireEvent.click(screen.getAllByRole("button", { name: /Lecture rapide des differences cliniques/i })[0]);
        expect(screen.getByText("Differences majeures")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Lecture mobile essentielle/i }));
        expect(screen.getAllByText("Cas 1").length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("Risque cardio-renal")).toBeInTheDocument();
        expect(screen.getByText("Contraste marque")).toBeInTheDocument();
        expect(screen.getAllByText("Point de vigilance principal")).toHaveLength(2);
        expect(screen.getAllByText("Micro-synthese scannable").length).toBeGreaterThanOrEqual(2);
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
