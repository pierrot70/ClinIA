import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomeI18nContext } from "../../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../../i18n/homeStrings";
import { ClinicalForm } from "./ClinicalForm";

vi.mock("../../hooks/useAuth", () => ({
    useAuth: () => ({ isAuthenticated: true, user: { role: "MEDECIN" } }),
}));
vi.mock("../../services/translationApi", () => ({ translateText: vi.fn().mockResolvedValue("") }));

describe("ClinicalForm local field translations", () => {
    beforeEach(() => window.localStorage.clear());

    it.each([
        ["fr-CA", "Age du patient", "Homme", "Femme", "Effacer les donnees patient"],
        ["en-CA", "Patient age", "Male", "Female", "Clear patient data"],
        ["es", "Edad del paciente", "Masculino", "Femenino", "Borrar los datos del paciente"],
        ["ko-KR", "환자 나이", "남성", "여성", "환자 데이터 지우기"],
        ["vi", "Tuổi người bệnh", "Nam", "Nữ", "Xóa dữ liệu người bệnh"],
        ["no-NO", "Pasientens alder", "Mann", "Kvinne", "Tøm pasientdata"],
        ["ja", "患者の年齢", "男性", "女性", "患者データを消去"],
        ["zh", "患者年龄", "男", "女", "清除患者数据"],
        ["he", "גיל המטופל", "זכר", "נקבה", "ניקוי נתוני המטופל"],
    ])("renders age, sex options and clear action in %s using the real translation hook", (locale, age, male, female, clear) => {
        const { container } = render(
            <HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR,
                isTranslating: false, setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}>
                <ClinicalForm onSubmit={vi.fn()} loading={false} />
            </HomeI18nContext.Provider>
        );
        fireEvent.change(container.querySelector("#clinical-field")!, { target: { value: "generalMedicine" } });
        fireEvent.change(container.querySelector("#clinical-example-case")!, { target: { value: "hypertension55" } });

        expect(screen.getByRole("spinbutton", { name: age })).toHaveValue(55);
        const sex = container.querySelector<HTMLSelectElement>("#clinical-sex")!;
        expect(within(sex).getByRole("option", { name: male })).toHaveValue("male");
        expect(within(sex).getByRole("option", { name: female })).toHaveValue("female");
        expect(sex).toHaveValue("male");
        expect(screen.getByRole("button", { name: clear })).toBeEnabled();
    });
});
