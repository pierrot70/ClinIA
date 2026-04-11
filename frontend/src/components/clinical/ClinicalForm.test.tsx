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
});