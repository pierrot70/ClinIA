import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { COMPARISON_CASE_ONE, EXAMPLE_CASES } from "../../data/clinicalExampleCases";
import { SimulatedDiabetesOptionNote } from "./SimulatedDiabetesOptionNote";

const profile = { ...EXAMPLE_CASES.diabetesType255, age: 78 };
const glp = "Reassessment of a GLP-1 option";

describe("DT2-78 simulated frailty notes", () => {
  it("shows a distinct interpretation for each option", () => {
    const { rerender } = render(<SimulatedDiabetesOptionNote context={profile} sourceMode="mock" option="Metformin" />);
    expect(screen.getByText(/metformin this patient already takes/)).toHaveAttribute("translate", "no");
    rerender(<SimulatedDiabetesOptionNote context={profile} sourceMode="mock" option={glp} />);
    expect(screen.getByText(/unintended weight loss/)).toBeVisible();
    expect(screen.queryByText(/already takes/)).toBeNull();
  });

  it.each([
    [profile, "real", glp],
    [profile, "degraded", glp],
    [{ ...profile, diabetes_context: undefined }, "mock", glp],
    [{ ...profile, diabetes_context: { fragility: "High" } }, "mock", glp],
    [{ ...profile, diagnosis: "Type 1 diabetes" }, "mock", glp],
    [{ ...profile, age: 55 }, "mock", glp],
    [{ ...profile, current_medications: [] }, "mock", "Metformin"],
    [profile, "mock", "Another option"],
  ] as const)("omits an inapplicable interpretation (%#)", (context, sourceMode, option) => {
    const { container } = render(<SimulatedDiabetesOptionNote context={{ ...context, current_medications: [...context.current_medications] }} sourceMode={sourceMode} option={option} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("DT2-CV-58 simulated cardiovascular notes", () => {
  const patient = COMPARISON_CASE_ONE;
  it("explains secondary prevention for each option and preserves applicable frailty notes", () => {
    const view = (option: string, age = patient.age) =>
      <SimulatedDiabetesOptionNote context={{ ...patient, age }} sourceMode="mock" option={option} />;
    const { rerender } = render(view("Metformin"));
    expect(screen.getByText(/already takes metformin for glucose control/)).toHaveTextContent(/even if the HbA1c goal is met/);
    rerender(view(glp));
    expect(screen.getByText(/GLP-1 receptor agonist with proven cardiovascular benefit/)).toBeVisible();
    expect(screen.queryByText(/Low frailty leaves/)).toBeNull();
    rerender(view(glp, 78));
    expect(screen.getByText(/proven cardiovascular benefit/)).toBeVisible();
    expect(screen.getByText(/Low frailty leaves/)).toBeVisible();
  });

  it.each([
    ["mock", ["Hypertension", "Dyslipidemia"]],
    ["mock", ["No atherosclerotic cardiovascular disease"]],
    ["mock", ["Family history of ASCVD"]],
    ["real", patient.medical_history],
    ["degraded", patient.medical_history],
  ] as const)("requires a simulated result and a documented condition (%#)", (sourceMode, history) => {
    const context = { ...patient, medical_history: [...history] };
    for (const option of ["Metformin", glp]) {
      const { container, unmount } = render(<SimulatedDiabetesOptionNote context={context} sourceMode={sourceMode} option={option} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("only describes ongoing metformin when listed among current medications", () => {
    const { container } = render(<SimulatedDiabetesOptionNote context={{ ...patient, current_medications: [] }} sourceMode="mock" option="Metformin" />);
    expect(container).toBeEmptyDOMElement();
  });
});
