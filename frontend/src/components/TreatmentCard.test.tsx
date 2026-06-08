import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import TreatmentCard from "./TreatmentCard";

describe("TreatmentCard", () => {
    it("shows a stronger clinical relevance label for evidence-backed options", () => {
        render(
            <MemoryRouter>
                <TreatmentCard
                    sourceMode="real"
                    realAI={true}
                    treatment={{
                        id: "glp1",
                        name: "Option GLP-1",
                        shortName: "GLP-1",
                        class: "Traitement",
                        efficacy: 0.8,
                        sideEffectScore: 30,
                        summary: "Option a discuter selon le profil.",
                        details: "Details",
                        flags: ["monitoring"],
                        evidence_level: "A",
                        monitoring: ["Surveiller la tolerance digestive"],
                        contraindications: [],
                    }}
                />
            </MemoryRouter>
        );

        expect(
            screen.getByText("Pertinence clinique elevee")
        ).toBeInTheDocument();
        expect(
            screen.getByText("Base sur une reponse OpenAI reelle")
        ).toBeInTheDocument();
    });

    it("keeps a more cautious label when monitoring and contraindications are heavier", () => {
        render(
            <MemoryRouter>
                <TreatmentCard
                    sourceMode="mock"
                    treatment={{
                        id: "sglt2",
                        name: "Inhibiteur SGLT2",
                        shortName: "SGLT2",
                        class: "Traitement",
                        efficacy: 0.75,
                        sideEffectScore: 35,
                        summary: "Option avec vigilance.",
                        details: "Details",
                        flags: ["monitoring"],
                        evidence_level: "B",
                        monitoring: ["Fonction renale", "Hydratation"],
                        contraindications: ["DKA", "Hypovolemie"],
                    }}
                />
            </MemoryRouter>
        );

        expect(
            screen.getByText("Option pertinente avec vigilance")
        ).toBeInTheDocument();
        expect(screen.getByText("Base sur des donnees simulees")).toBeInTheDocument();
    });

    it("never exposes known French scenario content when English is selected", () => {
        render(
            <MemoryRouter>
                <TreatmentCard
                    language="en"
                    sourceMode="mock"
                    treatment={{
                        id: "metformin",
                        name: "Metformine",
                        shortName: "Metformine",
                        class: "Reevaluation clinique",
                        efficacy: 0.8,
                        sideEffectScore: 10,
                        summary:
                            "Peut etre raisonnable si le controle glycemique est adequat, si la tolerance est bonne et si les objectifs cliniques sont atteints.",
                        details: "Details",
                        flags: [],
                    }}
                />
            </MemoryRouter>
        );

        expect(screen.getByText("Metformin")).toBeInTheDocument();
        expect(screen.getByText("Clinical reassessment")).toBeInTheDocument();
        expect(
            screen.getByText(/May be reasonable when glycemic control is adequate/)
        ).toBeInTheDocument();
        expect(screen.queryByText(/Peut etre raisonnable/)).not.toBeInTheDocument();
    });
});
