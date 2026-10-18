import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import QuestionCard from "./QuestionCard";
import { UI_LOCALES } from "../i18n/uiLocales";

vi.mock("../hooks/useTranslation", () => ({
  useTranslation: () => { throw new Error("Clinical question content must never invoke translation"); },
}));

describe("QuestionCard source policy", () => {
  it.each(UI_LOCALES)("preserves English question and answer in %s", language => {
    render(<QuestionCard language={language} question="Which monitoring points require attention?" answer="Review renal function and hydration." />);
    expect(screen.getByText("Which monitoring points require attention?")).toHaveAttribute("translate", "no");
    expect(screen.getByText("Review renal function and hydration.")).toHaveAttribute("translate", "no");
  });
  it("preserves historical source content across language changes", () => {
    const { rerender } = render(<QuestionCard language="fr" question="Question originale" answer="Réponse originale" />);
    for (const language of UI_LOCALES) {
      rerender(<QuestionCard language={language} question="Question originale" answer="Réponse originale" />);
      expect(screen.getByText("Réponse originale")).toBeInTheDocument();
    }
  });
});
