import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EXAMPLE_CASES } from "../../data/clinicalExampleCases";
import { SimulatedFrailtyNote } from "./SimulatedFrailtyNote";

const profile = { ...EXAMPLE_CASES.diabetesType255, age: 78 };
const glp = "Reassessment of a GLP-1 option";

describe("DT2-78 simulated frailty notes", () => {
  it("shows a distinct interpretation for each option", () => {
    const { rerender } = render(<SimulatedFrailtyNote context={profile} sourceMode="mock" option="Metformin" />);
    expect(screen.getByText(/metformin this patient already takes/)).toHaveAttribute("translate", "no");
    rerender(<SimulatedFrailtyNote context={profile} sourceMode="mock" option={glp} />);
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
    const { container } = render(<SimulatedFrailtyNote context={{ ...context, current_medications: [...context.current_medications] }} sourceMode={sourceMode} option={option} />);
    expect(container).toBeEmptyDOMElement();
  });
});
