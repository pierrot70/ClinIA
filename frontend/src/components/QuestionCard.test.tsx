import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import QuestionCard from "./QuestionCard";
import { UI_LOCALES } from "../i18n/uiLocales";
import { hypertensionTreatments } from "../data/hypertension";
import { getSimulatedClinicalContent } from "../i18n/simulatedClinicalContent";

vi.mock("../hooks/useTranslation", () => ({
  useTranslation: ({ text }: { text: string }) => ({
    translated: text,
    loading: true,
    error: null,
  }),
}));

describe("QuestionCard", () => {
  it.each(UI_LOCALES)("shows both simulation answers in %s while translation is unavailable", (language) => {
    const sources = ["Aucun mock spécifique trouvé. Exemple générique.", hypertensionTreatments[0].summary];
    for (const answer of sources) {
      const { unmount } = render(<QuestionCard language={language} question="Synthetic question" answer={answer} />);
      expect(screen.getByText(getSimulatedClinicalContent(answer, language)!)).toBeInTheDocument();
      if (language !== "fr-CA") expect(screen.queryByText(answer)).not.toBeInTheDocument();
      unmount();
    }
  });
  it("updates an expanded simulated answer immediately when the selected language changes", () => {
    const answer = hypertensionTreatments[0].summary;
    const { rerender } = render(<QuestionCard language="es" question="Synthetic question" answer={answer} />);
    for (const language of UI_LOCALES) {
      rerender(<QuestionCard language={language} question="Synthetic question" answer={answer} />);
      expect(screen.getByText(getSimulatedClinicalContent(answer, language)!)).toBeInTheDocument();
    }
  });

  it.each([
    ["Aucun mock spécifique trouvé. Exemple générique.", "No se encontró una simulación específica. Ejemplo genérico."],
    [hypertensionTreatments[0].summary, "Agente de primera línea con un muy buen control de la presión arterial y un perfil de efectos secundarios generalmente favorable."],
  ])("localizes the simulated Spanish answer without remote translation: %s", (answer, expected) => {
    render(<QuestionCard language="es-MX" question="Pregunta ficticia" answer={answer} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.queryByText(answer)).not.toBeInTheDocument();
  });
  it("keeps French simulation answers and unknown clinical text unchanged", () => {
    expect(getSimulatedClinicalContent(hypertensionTreatments[0].summary, "fr")).toBe(hypertensionTreatments[0].summary);
    expect(getSimulatedClinicalContent("Unknown clinical API content", "es")).toBeNull();
  });

  it("preserves localized Spanish questions containing a French treatment name", () => {
    render(<QuestionCard language="es"
      question="¿Por qué Inhibiteur SGLT2 destaca como opción para discutir?"
      answer="Esta opción destaca en el contexto clínico actual." />);
    expect(screen.getByText("¿Por qué Inhibiteur SGLT2 destaca como opción para discutir?")).toBeInTheDocument();
    expect(screen.queryByText("Additional clinical question")).not.toBeInTheDocument();
  });

  it("keeps dynamically generated English questions and answers visible", () => {
    render(
      <QuestionCard
        language="en"
        question="What is the main clinical profile identified here?"
        answer="This option stands out in the current clinical context."
      />
    );

    expect(
      screen.getByText("What is the main clinical profile identified here?")
    ).toBeInTheDocument();
    expect(
      screen.getByText("This option stands out in the current clinical context.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it("uses immediate English content for known French simulated questions", () => {
    render(
      <QuestionCard
        language="en"
        question="Les antibiotiques sont-ils utiles ?"
        answer="Donnees simulees : pas dans la mononucleose virale non compliquee, sauf si une autre infection bacterienne est documentee."
      />
    );

    expect(screen.getByText("Are antibiotics useful?")).toBeInTheDocument();
    expect(
      screen.getByText(/not for uncomplicated viral mononucleosis/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });
});
