import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import QuestionCard from "./QuestionCard";

vi.mock("../hooks/useTranslation", () => ({
  useTranslation: ({ text }: { text: string }) => ({
    translated: text,
    loading: true,
    error: null,
  }),
}));

describe("QuestionCard", () => {
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
