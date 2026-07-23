import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import SearchBar from "../components/SearchBar";
import Results from "./Results";
import { ClinicalAnalysisNavigationProvider } from "../contexts/ClinicalAnalysisNavigationContext";

const { analyzeMock, fetchPatientsPaginatedMock } = vi.hoisted(() => ({
  analyzeMock: vi.fn(),
  fetchPatientsPaginatedMock: vi.fn(),
}));

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
  const stringsModule = await vi.importActual("../i18n/homeStrings");
  return {
    ...actual,
    useHomeI18n: () => ({
      locale: "fr",
      strings: stringsModule.HOME_STRINGS_FR,
    }),
  };
});

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      email: "medecin@test.local",
    },
  }),
}));

vi.mock("../services/patientsApi", () => ({
  fetchPatientsPaginated: fetchPatientsPaginatedMock,
  createPatient: vi.fn(),
  updatePatient: vi.fn(),
}));

fetchPatientsPaginatedMock.mockImplementation(async () => ({
    data: {
      data: [],
      meta: {
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 1,
        source: "real",
        model: "test",
      },
    },
  }));

vi.mock("../services/securityIncidentApi", () => ({
  acknowledgeSecurityIncident: vi.fn(),
  REQUIRED_ACK_ACTION: "J'ai lu et compris",
}));

vi.mock("../components/AICard", () => ({
  default: () => <div data-testid="ai-card" />,
}));

vi.mock("../components/ClinicalDemoResult", () => ({
  default: () => <div data-testid="clinical-demo-result" />,
}));

vi.mock("../components/system/SecurityBlockingAlert", () => ({
  SecurityBlockingAlert: () => <div data-testid="security-blocking-alert" />,
}));

describe("Search to Results integration", () => {
  beforeEach(() => {
    analyzeMock.mockReset();
    fetchPatientsPaginatedMock.mockClear();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("forwards the age entered in advanced settings to the results analysis payload", async () => {
    const user = userEvent.setup();

    render(
      <ClinicalAnalysisNavigationProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={<SearchBar />} />
            <Route path="/results" element={<Results />} />
          </Routes>
        </MemoryRouter>
      </ClinicalAnalysisNavigationProvider>
    );

    await waitFor(() => {
      expect(fetchPatientsPaginatedMock).toHaveBeenCalledTimes(1);
    });

    await user.click(
      screen.getByRole("button", { name: /afficher paramètres avancés/i })
    );

    await user.type(screen.getByLabelText(/^Sexe$/i), "male");
    await user.type(screen.getByLabelText(/^Age$/i), "70");
    await user.type(
      screen.getByLabelText(/Médication actuelle/i),
      "Amlodipine; Losartan"
    );

    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: /Lancer Requête sécurisée/i })
    );

    await waitFor(() => {
      expect(analyzeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          age: 70,
          sex: "male",
          current_medications: ["Amlodipine", "Losartan"],
          medical_history: [],
          forceReal: false,
        })
      );
    });

    const latestPayload = analyzeMock.mock.calls.at(-1)?.[0];
    expect(latestPayload?.symptoms).toHaveLength(1);
    expect(latestPayload?.symptoms?.[0]).toContain("Age: 70");
    expect(window.sessionStorage.getItem("clinia_results_payload")).toBeNull();
  });
});
