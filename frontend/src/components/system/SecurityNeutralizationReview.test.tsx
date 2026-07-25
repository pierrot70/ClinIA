import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SecurityNeutralizationReview } from "./SecurityNeutralizationReview";

describe("SecurityNeutralizationReview", () => {
    it("shows the local original value alongside the server-safe corrected value", () => {
        render(
            <SecurityNeutralizationReview
                originalPayload={{
                    age: 55,
                    sex: "male",
                    diagnosis: "Hypertension arterielle",
                    symptoms: ["Cephalee", "canary@invalid.test"],
                    medical_history: [],
                    current_medications: [],
                }}
                preview={{ symptoms: ["Cephalee"] }}
                labels={{
                    title: "Verification avant transmission",
                    description: "Verifiez les valeurs corrigees.",
                    original: "Valeur originale",
                    corrected: "Valeur corrigee",
                    empty: "Aucun element conserve",
                    continue: "Continuer",
                    cancel: "Annuler",
                    fields: { symptoms: "Symptomes principaux" },
                }}
                onContinue={vi.fn()}
                onCancel={vi.fn()}
            />
        );

        expect(screen.getByText("Cephalee, canary@invalid.test")).toBeInTheDocument();
        expect(screen.getByText("Cephalee")).toBeInTheDocument();
        expect(screen.getByText("Symptomes principaux")).toBeInTheDocument();
    });
});
