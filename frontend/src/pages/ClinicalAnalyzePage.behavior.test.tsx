import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const analyzeMock = vi.fn();
const clinicalFormSpy = vi.fn();

vi.mock("../components/clinical/ClinicalForm", () => ({
    ClinicalForm: (props: any) => {
        clinicalFormSpy(props);

        return (
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
        );
    },
}));

vi.mock("../components/ClinicalDemoResult", () => ({
    default: () => <div data-testid="clinical-demo-result" />,
}));

vi.mock("../hooks/useClinicalAnalysis", () => ({
    useClinicalAnalysis: () => ({
        result: null,
        loading: false,
        error: null,
        analyze: analyzeMock,
    }),
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

vi.mock("../contexts/SecurityIncidentContext", () => ({
    useSecurityIncident: () => ({
        blockingIncident: null,
        setBlockingIncident: vi.fn(),
    }),
}));

import { ClinicalAnalyzePage } from "./ClinicalAnalyzePage";

describe("ClinicalAnalyzePage", () => {
    it("submits the exact user payload without injecting the demo case", () => {
        render(<ClinicalAnalyzePage />);

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
});