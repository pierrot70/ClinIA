import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import TreatmentDetails from "./TreatmentDetails";

describe("TreatmentDetails", () => {
    it.each([
        { details: " Source details ", summary: "Summary", justification: "Rationale", indication: "Indication", expected: " Source details " },
        { details: " \t", summary: " Source summary ", justification: "Rationale", indication: "Indication", expected: " Source summary " },
        { details: "", summary: "", justification: " Source rationale ", indication: "Indication", expected: " Source rationale " },
        { details: "", summary: " ", justification: "\t", indication: " Source indication ", expected: " Source indication " },
    ])("selects the first nonempty explanation without modifying it: $expected", fields => {
        render(<MemoryRouter initialEntries={[{ pathname: "/treatment/source-option", state: {
            treatment: { id: "source-option", name: "Source option", ...fields },
        } }]}><Routes><Route path="/treatment/:id" element={<TreatmentDetails />} /></Routes></MemoryRouter>);
        const explanation = screen.getByText(fields.expected.trim());
        expect(explanation.textContent).toBe(fields.expected);
        expect(explanation).toHaveAttribute("translate", "no");
    });

    it("uses treatment state passed from the clinical card", () => {
        render(
            <MemoryRouter
                initialEntries={[
                    {
                        pathname: "/treatment/glp1",
                        state: {
                            sourceMode: "real",
                            realAI: true,
                            treatment: {
                                id: "glp1",
                                name: "Option GLP-1",
                                class: "Traitement",
                                summary: "Option a discuter selon le profil.",
                                evidence_level: "A",
                                monitoring: ["Surveiller la tolerance digestive"],
                                contraindications: ["Pancreatite active"],
                            },
                        },
                    } as never,
                ]}
            >
                <Routes>
                    <Route path="/treatment/:id" element={<TreatmentDetails />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getAllByText("Reponse OpenAI reelle")).toHaveLength(2);
        expect(screen.getByText("Option GLP-1")).toBeInTheDocument();
        expect(screen.getByText("Pertinence clinique elevee")).toBeInTheDocument();
        expect(screen.getByText("Pancreatite active")).toBeInTheDocument();
    });
});

it("does not interpret missing treatment precautions as standard surveillance or no clinical risk", () => {
    render(<MemoryRouter initialEntries={[{ pathname: "/treatment/unscoped", state: {
        treatment: { id: "unscoped", name: "Synthetic unscoped option", contraindications: [], monitoring: [] },
    } }]}><Routes><Route path="/treatment/:id" element={<TreatmentDetails />} /></Routes></MemoryRouter>);
    expect(screen.getByText("Non renseigné")).toBeInTheDocument();
    expect(screen.queryByText("Surveillance standard")).not.toBeInTheDocument();
    expect(screen.getByText("Aucune contre-indication detaillee fournie.")).toBeInTheDocument();
    expect(screen.getAllByText("Aucun point de surveillance detaille fourni.").length).toBeGreaterThan(0);
});
