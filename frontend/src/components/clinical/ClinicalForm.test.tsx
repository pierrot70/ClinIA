import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ClinicalForm } from "./ClinicalForm";

vi.mock("../../hooks/useTranslation", () => ({
    useTranslation: ({ text }: { text: string }) => ({
        translated: text,
        loading: false,
        error: null,
    }),
}));

vi.mock("../../hooks/useAuth", () => ({
    useAuth: () => ({
        isAuthenticated: true,
        user: { role: "MEDECIN" },
    }),
}));

describe("ClinicalForm", () => {
    const caseFieldMap: Record<string, string> = {
        hypertension55: "generalMedicine",
        gastricCancer59: "oncology",
        mononucleosis35: "infectiousDiseases",
        cataract72: "ophthalmology",
        majorDepression42: "mentalHealth",
        diabetesType255: "endocrinology",
    };

    function selectExampleCase(caseId: string) {
        fireEvent.change(screen.getByLabelText("Champ clinique"), {
            target: { value: caseFieldMap[caseId] },
        });
        fireEvent.change(screen.getByLabelText("Cas exemple"), {
            target: { value: caseId },
        });
    }

    beforeEach(() => {
        window.localStorage.clear();
    });

    it("shows only the example case picker before a selection is made", () => {
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

        expect(
            screen.getByText(
                "Commencez par choisir un cas exemple pour préremplir rapidement le formulaire, puis ajustez les champs selon votre patient."
            )
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "Le reste du formulaire apparaîtra après la sélection d'un cas exemple."
            )
        ).toBeInTheDocument();
        expect(screen.getByLabelText("Champ clinique")).toHaveValue("");
        expect(screen.getByLabelText("Cas exemple")).toBeDisabled();
        expect(screen.queryByLabelText("Pays du patient")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Analyser" })).not.toBeInTheDocument();
    });

    it("defaults the country from the browser locale and submits the selected ethnicity", async () => {
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

        selectExampleCase("hypertension55");

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

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    country: "CA",
                    ethnicity: "asian",
                })
            );
        });
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

        selectExampleCase("hypertension55");

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

        selectExampleCase("gastricCancer59");

        expect(screen.getByLabelText("Age du patient")).toHaveValue(59);
        expect(screen.getByLabelText("Sexe")).toHaveValue("female");
        expect(screen.getByLabelText("Diagnostic / motif clinique principal")).toHaveValue(
            "Cancer de l'estomac"
        );
        expect(screen.getByLabelText("Antecedents medicaux")).toHaveValue("Anemie");
    });

    it("imports a clinical payload from a pasted JSON object", () => {
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

        selectExampleCase("hypertension55");

        fireEvent.change(screen.getByLabelText("Importer un objet JSON"), {
            target: {
                value: JSON.stringify({
                    age: 79,
                    sex: "female",
                    country: "CA",
                    ethnicity: "asian",
                    diagnosis: "Diabete de type 2",
                    symptoms: ["Fatigue", "Hyperglycemie persistante"],
                    medical_history: ["Insuffisance renale chronique"],
                    current_medications: ["Metformine"],
                    diabetes_context: {
                        cardiovascular_risk: "Tres eleve",
                        fragility: "Elevee",
                    },
                }),
            },
        });

        fireEvent.click(
            screen.getByRole("button", {
                name: "Charger le JSON dans le formulaire",
            })
        );

        expect(screen.getByLabelText("Age du patient")).toHaveValue(79);
        expect(screen.getByLabelText("Sexe")).toHaveValue("female");
        expect(screen.getByLabelText("Pays du patient")).toHaveValue("CA");
        expect(screen.getByLabelText("Ethnicite du patient")).toHaveValue("asian");
        expect(screen.getByLabelText("Diagnostic / motif clinique principal")).toHaveValue(
            "Diabete de type 2"
        );
        expect(screen.getByLabelText("Antecedents medicaux")).toHaveValue(
            "Insuffisance renale chronique"
        );
    });

    it("loads two pasted JSON payloads for visual comparison", async () => {
        const onCompareSubmit = vi.fn();

        render(
            <ClinicalForm
                onSubmit={() => {}}
                onCompareSubmit={onCompareSubmit}
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

        selectExampleCase("hypertension55");

        fireEvent.click(screen.getByLabelText("Mode comparaison visuelle"));

        fireEvent.change(screen.getByLabelText("JSON cas 1"), {
            target: {
                value: JSON.stringify({
                    age: 55,
                    sex: "male",
                    diagnosis: "Diabete de type 2",
                    symptoms: ["Polydipsie"],
                    medical_history: [],
                    current_medications: ["Metformine"],
                }),
            },
        });
        fireEvent.change(screen.getByLabelText("JSON cas 2"), {
            target: {
                value: JSON.stringify({
                    age: 79,
                    sex: "female",
                    diagnosis: "Diabete de type 2",
                    symptoms: ["Fatigue"],
                    medical_history: ["Insuffisance renale chronique"],
                    current_medications: ["Metformine"],
                }),
            },
        });

        fireEvent.click(
            screen.getByRole("button", { name: "Comparer les 2 cas" })
        );

        expect(onCompareSubmit).toHaveBeenCalledWith(
            expect.objectContaining({
                age: 55,
                sex: "male",
                diagnosis: "Diabete de type 2",
            }),
            expect.objectContaining({
                age: 79,
                sex: "female",
                diagnosis: "Diabete de type 2",
            })
        );
        expect(
            await screen.findByText("Les deux cas ont ete charges pour comparaison.")
        ).toBeInTheDocument();
    });

    it("opens a modal to edit example JSON before loading case 1 and case 2", () => {
        render(
            <ClinicalForm
                onSubmit={() => {}}
                onCompareSubmit={() => {}}
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

        selectExampleCase("hypertension55");

        fireEvent.click(screen.getByLabelText("Mode comparaison visuelle"));
        fireEvent.click(screen.getByRole("button", { name: "Charger cas 1" }));
        expect(
            screen.getByRole("heading", { name: "Editer le JSON - Cas 1" })
        ).toBeInTheDocument();
        const caseOneDialog = screen.getByRole("dialog");
        const medicationSelect = within(caseOneDialog).getByRole("listbox");
        expect(medicationSelect).toBeInTheDocument();
        fireEvent.change(within(caseOneDialog).getByRole("spinbutton", { name: "Age du patient" }), {
            target: { value: "61" },
        });
        fireEvent.change(
            within(caseOneDialog).getByRole("textbox", {
                name: "Diagnostic / motif clinique principal",
            }),
            {
                target: { value: "Diabete de type 2" },
            }
        );
        const medicationOptions = within(caseOneDialog).getAllByRole("option");
        const metforminOption = medicationOptions.find(
            (option) => (option as HTMLOptionElement).value === "Metformine"
        ) as HTMLOptionElement;
        const semaglutideOption = medicationOptions.find(
            (option) => (option as HTMLOptionElement).value === "Semaglutide"
        ) as HTMLOptionElement;
        metforminOption.selected = true;
        semaglutideOption.selected = true;
        fireEvent.change(medicationSelect);
        fireEvent.click(screen.getByRole("button", { name: "Charger ce JSON" }));

        fireEvent.click(screen.getByRole("button", { name: "Charger cas 2" }));
        expect(
            screen.getByRole("heading", { name: "Editer le JSON - Cas 2" })
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Charger ce JSON" }));

        expect(
            (screen.getByLabelText("JSON cas 1") as HTMLTextAreaElement).value
        ).toContain('"age": 61');
        expect(
            (screen.getByLabelText("JSON cas 1") as HTMLTextAreaElement).value
        ).toContain('"diagnosis": "Diabete de type 2"');
        expect(
            (screen.getByLabelText("JSON cas 2") as HTMLTextAreaElement).value
        ).toContain('"age": 58');
        expect(
            (screen.getByLabelText("JSON cas 2") as HTMLTextAreaElement).value
        ).toContain('"current_medications": [');
        expect(
            (screen.getByLabelText("JSON cas 2") as HTMLTextAreaElement).value
        ).toContain('"Empagliflozine"');
        expect(
            (screen.getByLabelText("JSON cas 1") as HTMLTextAreaElement).value
        ).toContain('"Semaglutide"');
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

        selectExampleCase("diabetesType255");

        expect(screen.getByLabelText("Age du patient")).toHaveValue(55);
        expect(screen.getByLabelText("Diagnostic / motif clinique principal")).toHaveValue(
            "Diabete de type 2"
        );
        expect(screen.getByLabelText("Antecedents medicaux")).toHaveValue(
            "Hypertension arterielle"
        );
        expect(screen.getByLabelText("Medication actuelle")).toHaveValue("Metformine");
        expect(
            screen.getByText(
                "Pre-remplissez rapidement les parametres cliniques utiles au diabete de type 2."
            )
        ).toBeInTheDocument();
        expect(
            screen.getByText("Vous pouvez ensuite les ajuster selon le profil du patient.")
        ).toBeInTheDocument();
        expect(
            screen.getByText("Quand tout vous convient, cliquez sur Analyser.")
        ).toBeInTheDocument();
    });

    it("opens the diabetes modal with default values and saves them into the payload", async () => {
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

        selectExampleCase("diabetesType255");

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

        await waitFor(() => {
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
});
