import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import Results from "./Results";
import type { ClinicalPayload } from "../types/clinical";

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
  q: string;
  state?: {
    patientDisplayName?: string;
    analysisPayload?: ClinicalPayload;
  };
}) {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: "/results",
          search: `?q=${encodeURIComponent(options.q)}`,
          state: options.state,
        } as never,
      ]}
    >
      <Routes>
        <Route path="/results" element={<Results />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Results payload forwarding", () => {
  beforeEach(() => {
    analyzeMock.mockReset();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("uses the analysis payload from navigation state instead of hardcoded defaults", async () => {
    renderResults({
      q: "Main symptom: Hypertension | Age: 70",
      state: {
        patientDisplayName: "Jean Tremblay",
        analysisPayload: {
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

  it("uses the persisted session payload when the page reloads without navigation state", async () => {
    window.sessionStorage.setItem(
      "clinia_results_payload",
      JSON.stringify({
        q: "Main symptom: Hypertension | Age: 70",
        payload: {
          age: 70,
          sex: "male",
          symptoms: ["Main symptom: Hypertension | Age: 70"],
          medical_history: [],
          current_medications: ["Amlodipine"],
        },
      })
    );

    renderResults({
      q: "Main symptom: Hypertension | Age: 70",
    });

    await waitFor(() => {
      expect(analyzeMock).toHaveBeenCalledWith({
        age: 70,
        sex: "male",
        symptoms: ["Main symptom: Hypertension | Age: 70"],
        medical_history: [],
        current_medications: ["Amlodipine"],
        forceReal: false,
      });
    });
  });
});