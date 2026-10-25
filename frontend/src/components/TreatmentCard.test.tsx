import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import TreatmentCard from "./TreatmentCard";

describe("TreatmentCard", () => {
    it.each([
        { flags: [] },
        { flags: ["wellTolerated", "monitoring"] as const },
    ])("does not infer first-line status while preserving supplied flags: $flags", ({ flags }) => {
        render(<MemoryRouter><TreatmentCard treatment={{
            id: "synthetic-option", name: "Synthetic option", shortName: "Option",
            class: "Source class", summary: "Source summary", details: "Source details",
            efficacy: 0.5, sideEffectScore: 10, flags: [...flags],
        }} /></MemoryRouter>);
        expect(screen.queryByText(UI_LABELS_FR.componentUi.firstLine)).not.toBeInTheDocument();
        for (const [flag, label] of [
            ["wellTolerated", UI_LABELS_FR.componentUi.bienTolere],
            ["monitoring", UI_LABELS_FR.componentUi.surveillanceRequise],
        ] as const) {
            if ((flags as readonly string[]).includes(flag)) expect(screen.getByText(label)).toBeInTheDocument();
            else expect(screen.queryByText(label)).not.toBeInTheDocument();
        }
    });

    it("does not elevate the relevance badge when option precautions are not provided", () => {
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
            screen.getByText("Option cliniquement solide")
        ).toBeInTheDocument();
        expect(screen.queryByText("Pertinence clinique elevee")).not.toBeInTheDocument();
        expect(
            screen.getByText("Base sur une reponse OpenAI reelle")
        ).toBeInTheDocument();
    });

    it.each([
        { monitoring: undefined, contraindications: undefined },
        { monitoring: [], contraindications: [] },
        { monitoring: ["Supplied monitoring"], contraindications: undefined },
        { monitoring: undefined, contraindications: ["Supplied restriction"] },
    ])("does not mistake missing or empty precaution lists for lower clinical risk: %j", fields => {
        render(<MemoryRouter><TreatmentCard sourceMode="real" treatment={{
            id: "incomplete-option", name: "Incomplete source option", shortName: "Option",
            class: "Source class", efficacy: 0.5, sideEffectScore: 10,
            summary: "Authored summary", details: "Authored details", flags: [],
            evidence_level: "A", ...fields,
        }} /></MemoryRouter>);
        expect(screen.queryByText(UI_LABELS_FR.pageUi.pertinenceCliniqueElevee)).not.toBeInTheDocument();
        expect(screen.getByText(UI_LABELS_FR.pageUi.optionCliniquementSolide)).toBeInTheDocument();
    });

    it("uses the higher heuristic badge only with both supplied scoped precaution lists", () => {
        render(<MemoryRouter><TreatmentCard sourceMode="real" treatment={{
            id: "scoped-option", name: "Scoped source option", shortName: "Option",
            class: "Source class", efficacy: 0.5, sideEffectScore: 10,
            summary: "Authored summary", details: "Authored details", flags: [],
            evidence_level: "A", monitoring: ["Supplied monitoring"], contraindications: ["Supplied restriction"],
        }} /></MemoryRouter>);
        expect(screen.getByText(UI_LABELS_FR.pageUi.pertinenceCliniqueElevee)).toBeInTheDocument();
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

    it("preserves historical source content when English UI is selected", () => {
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

        expect(screen.getByText("Metformine")).toBeInTheDocument();
        expect(screen.getByText("Reevaluation clinique")).toBeInTheDocument();
        expect(
            screen.getByText(/Peut etre raisonnable si le controle glycemique/)
        ).toBeInTheDocument();
        expect(screen.queryByText(/May be reasonable/)).not.toBeInTheDocument();
    });
});
