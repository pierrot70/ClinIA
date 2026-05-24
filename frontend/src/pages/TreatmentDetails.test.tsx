import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import TreatmentDetails from "./TreatmentDetails";

describe("TreatmentDetails", () => {
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
