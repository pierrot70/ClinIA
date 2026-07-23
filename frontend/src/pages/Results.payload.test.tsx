import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import Results from "./Results";
import type { ClinicalPayload } from "../types/clinical";
import { ClinicalAnalysisNavigationProvider } from "../contexts/ClinicalAnalysisNavigationContext";

const analyzeMock = vi.fn();

vi.mock("../hooks/useClinicalAnalysis", () => ({
  useClinicalAnalysis: () => ({
    result: null,
    loading: false,
    error: null,
    analyze: analyzeMock,
  }),
}));

vi.mock("../contexts/HomeI18nContext", async () => {
  const actual = await vi.importActual("../contexts/HomeI18nContext");
  return {
    ...actual,
    useHomeI18n: () => ({ locale: "fr" }),
  };
});

vi.mock("../components/AICard", () => ({
  default: () => <div data-testid="ai-card" />,
}));

vi.mock("../components/ClinicalDemoResult", () => ({
  default: () => <div data-testid="clinical-demo-result" />,
}));

vi.mock("../components/system/SecurityBlockingAlert", () => ({
  SecurityBlockingAlert: () => <div data-testid="security-blocking-alert" />,
}));

vi.mock("../services/securityIncidentApi", () => ({
  acknowledgeSecurityIncident: vi.fn(),
  REQUIRED_ACK_ACTION: "J'ai lu et compris",
}));

function renderResults(options: {
  pendingClinicalAnalysis?: {
    patientDisplayName?: string;
    payload: ClinicalPayload;
  };
}) {
  return render(
    <ClinicalAnalysisNavigationProvider
      initialPendingClinicalAnalysis={options.pendingClinicalAnalysis}
    >
      <MemoryRouter initialEntries={["/results"]}>
        <Routes>
          <Route path="/results" element={<Results />} />
        </Routes>
      </MemoryRouter>
    </ClinicalAnalysisNavigationProvider>
  );
}

describe("Results payload forwarding", () => {
  beforeEach(() => {
    analyzeMock.mockReset();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("uses the in-memory navigation payload instead of hardcoded defaults", async () => {
    renderResults({
      pendingClinicalAnalysis: {
        patientDisplayName: "Jean Tremblay",
        payload: {
          age: 70,
          sex: "male",
          symptoms: ["Main symptom: Hypertension | Age: 70"],
          medical_history: [],
          current_medications: ["Ramipril"],
        },
      },
    });

    await waitFor(() => {
      expect(analyzeMock).toHaveBeenCalledWith({
        age: 70,
        sex: "male",
        symptoms: ["Main symptom: Hypertension | Age: 70"],
        medical_history: [],
        current_medications: ["Ramipril"],
        forceReal: false,
      });
    });
  });

  it("does not restore a persisted clinical payload after a reload", async () => {
    window.sessionStorage.setItem(
      "clinia_results_payload",
      JSON.stringify({
        payload: {
          age: 70,
          sex: "male",
          symptoms: ["Main symptom: Hypertension | Age: 70"],
          medical_history: [],
          current_medications: ["Amlodipine"],
        },
      })
    );

    renderResults({});

    await waitFor(() => {
      expect(analyzeMock).toHaveBeenCalledWith({
        age: 55,
        sex: "male",
        symptoms: ["Hypertension essentielle"],
        medical_history: [],
        current_medications: [],
        forceReal: false,
      });
    });

    expect(window.sessionStorage.getItem("clinia_results_payload")).toBeNull();
  });
});
