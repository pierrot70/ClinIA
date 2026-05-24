import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ClinicalForm } from "./ClinicalForm";

vi.mock("../../hooks/useTranslation", () => ({
    useTranslation: ({ text }: { text: string }) => ({
        translated: text,
        loading: false,
        error: null,
    }),
}));

describe("ClinicalForm", () => {
    it("defaults the country from the browser locale and submits the selected ethnicity", () => {
        const onSubmit = vi.fn();

        Object.defineProperty(window.navigator, "languages", {
            configurable: true,
            value: ["fr-CA"],
        });

        render(
            <ClinicalForm
                onSubmit={onSubmit}
                loading={false}
                initialData={{
                    age: 55,
                    sex: "male",
                    diagnosis: "",
                    symptoms: [],
                    medical_history: [],
                    current_medications: [],
                }}
            />
        );

        expect(screen.getByLabelText("Pays du patient")).toHaveValue("CA");
        expect(
            screen.getByText("Pays detecte par le navigateur : Canada (CA)")
        ).toBeInTheDocument();
        expect(screen.getByLabelText("Ethnicite du patient")).toHaveValue(
            "prefer_not_to_say"
        );

        fireEvent.change(screen.getByLabelText("Ethnicite du patient"), {
            target: { value: "asian" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Analyser" }));

        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({
                country: "CA",
                ethnicity: "asian",
            })
        );
    });

    it("preserves spaces while typing in medical history", () => {
        render(
            <ClinicalForm
                onSubmit={() => {}}
                loading={false}
                initialData={{
                    age: 55,
                    sex: "male",
                    diagnosis: "",
                    symptoms: [],
                    medical_history: [],
                    current_medications: [],
                }}
            />
        );

        const input = screen.getByLabelText("Antecedents medicaux");

        fireEvent.change(input, { target: { value: "Diabete " } });

        expect(input).toHaveValue("Diabete ");
    });

    it("fills the form when an example case is selected", () => {
        render(
            <ClinicalForm
                onSubmit={() => {}}
                loading={false}
                initialData={{
                    age: 55,
                    sex: "male",
                    diagnosis: "",
                    symptoms: [],
                    medical_history: [],
                    current_medications: [],
                }}
            />
        );

        fireEvent.change(screen.getByLabelText("Cas exemple"), {
            target: { value: "gastricCancer59" },
        });

        expect(screen.getByLabelText("Age du patient")).toHaveValue(59);
        expect(screen.getByLabelText("Sexe")).toHaveValue("female");
        expect(screen.getByLabelText("Diagnostic / motif clinique principal")).toHaveValue(
            "Cancer de l'estomac"
        );
        expect(screen.getByLabelText("Antecedents medicaux")).toHaveValue("Anemie");
    });

    it("fills the form with the type 2 diabetes example case", () => {
        render(
            <ClinicalForm
                onSubmit={() => {}}
                loading={false}
                initialData={{
                    age: 55,
                    sex: "male",
                    diagnosis: "",
                    symptoms: [],
                    medical_history: [],
                    current_medications: [],
                }}
            />
        );

        fireEvent.change(screen.getByLabelText("Cas exemple"), {
            target: { value: "diabetesType255" },
        });

        expect(screen.getByLabelText("Age du patient")).toHaveValue(55);
        expect(screen.getByLabelText("Diagnostic / motif clinique principal")).toHaveValue(
            "Diabete de type 2"
        );
        expect(screen.getByLabelText("Antecedents medicaux")).toHaveValue(
            "Hypertension arterielle"
        );
        expect(screen.getByLabelText("Medication actuelle")).toHaveValue("Metformine");
    });

    it("opens the diabetes modal with default values and saves them into the payload", () => {
        const onSubmit = vi.fn();

        render(
            <ClinicalForm
                onSubmit={onSubmit}
                loading={false}
                initialData={{
                    age: 55,
                    sex: "male",
                    diagnosis: "",
                    symptoms: [],
                    medical_history: [],
                    current_medications: [],
                }}
            />
        );

        fireEvent.change(screen.getByLabelText("Cas exemple"), {
            target: { value: "diabetesType255" },
        });

        fireEvent.click(screen.getByRole("button", { name: "Parametres diabete type 2" }));

        expect(
            screen.getByRole("heading", {
                name: "Parametres cliniques supplementaires - Diabete Type 2",
            })
        ).toBeInTheDocument();

        expect(screen.getAllByLabelText("Poids du patient (kg)")[1]).toHaveValue(94);
        expect(screen.getByLabelText("Risque cardiovasculaire")).toHaveValue(
            "Modere a eleve"
        );

        fireEvent.change(screen.getByLabelText("Tolerance"), {
            target: { value: "Tolerance digestive a reevaluer" },
        });

        fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
        fireEvent.click(screen.getByRole("button", { name: "Analyser" }));

        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({
                weight: 94,
                diabetes_context: expect.objectContaining({
                    cardiovascular_risk: "Modere a eleve",
                    tolerance: "Tolerance digestive a reevaluer",
                }),
            })
        );
    });
});
