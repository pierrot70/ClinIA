import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { SPECIALTIES } from "../data/specialties";
import { getLocalUiTranslation } from "../i18n/localUiTranslations";
import { AppointmentsPage } from "./AppointmentsPage";

const api = vi.hoisted(() => ({ clinics: vi.fn(), patient: vi.fn(), patients: vi.fn(), recommendation: vi.fn() }));
vi.mock("../services/appointmentsApi", () => ({
    fetchReferringClinics: api.clinics, fetchAppointmentRecommendation: api.recommendation,
    createAppointment: vi.fn(), createAppointmentCoordinationRequest: vi.fn(),
    fetchAvailableSlots: vi.fn(), fetchManualAppointmentOptions: vi.fn(),
}));
vi.mock("../services/patientsApi", () => ({ fetchPatientById: api.patient, fetchPatientsPaginated: api.patients }));
vi.mock("../services/translationApi", () => ({ translateText: vi.fn().mockResolvedValue("") }));

function Page({ locale, selected = false }: { locale: string; selected?: boolean }) {
    return <MemoryRouter initialEntries={[{ pathname: "/appointments", state: selected ? { patientId: "synthetic-patient" } : null }]}>
        <HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR, isTranslating: false,
            setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}>
            <AppointmentsPage />
        </HomeI18nContext.Provider>
    </MemoryRouter>;
}

beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    api.clinics.mockResolvedValue({ data: [{ _id: "synthetic-clinic", nom: "Synthetic clinic" }] });
    api.patient.mockResolvedValue({ data: { _id: "synthetic-patient", nom: "Example", prenom: "Synthetic", num_assurance_maladie: "" } });
    api.patients.mockResolvedValue({ data: { data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 1 } } });
    api.recommendation.mockResolvedValue({ data: null, meta: { recommendationStatus: "NO_SPECIALISTS_FOR_SPECIALTY" } });
});
afterEach(cleanup);

const expectedLabels: Record<string, string[]> = {
    "fr-CA": ["Médecin de famille", "Urgentologue", "Ophtalmologue", "Cardiologue", "Pneumologue", "Neurologue", "Endocrinologue", "Néphrologue", "Rhumatologue"],
    "en-CA": ["Family Physician", "Emergency Physician", "Ophthalmologist", "Cardiologist", "Pulmonologist", "Neurologist", "Endocrinologist", "Nephrologist", "Rheumatologist"],
    es: ["Médico de familia", "Médico de urgencias", "Oftalmólogo", "Cardiólogo", "Neumólogo", "Neurólogo", "Endocrinólogo", "Nefrólogo", "Reumatólogo"],
    "ko-KR": ["가정의학과 의사", "응급의학과 의사", "안과 의사", "심장내과 의사", "호흡기내과 의사", "신경과 의사", "내분비내과 의사", "신장내과 의사", "류마티스내과 의사"],
    vi: ["Bác sĩ gia đình", "Bác sĩ cấp cứu", "Bác sĩ nhãn khoa", "Bác sĩ tim mạch", "Bác sĩ hô hấp", "Bác sĩ thần kinh", "Bác sĩ nội tiết", "Bác sĩ thận học", "Bác sĩ cơ xương khớp"],
    "no-NO": ["Allmennlege", "Akuttlege", "Øyelege", "Kardiolog", "Lungelege", "Nevrolog", "Endokrinolog", "Nyrelege", "Revmatolog"],
    ja: ["家庭医", "救急医", "眼科医", "循環器内科医", "呼吸器内科医", "神経内科医", "内分泌内科医", "腎臓内科医", "リウマチ科医"],
    zh: ["家庭医生", "急诊医生", "眼科医生", "心脏科医生", "呼吸科医生", "神经内科医生", "内分泌科医生", "肾内科医生", "风湿科医生"],
    he: ["רופא משפחה", "רופא לרפואה דחופה", "רופא עיניים", "קרדיולוג", "רופא ריאות", "נוירולוג", "אנדוקרינולוג", "נפרולוג", "ראומטולוג"],
};

describe("appointment specialty display names", () => {
    it.each(Object.entries(expectedLabels))("renders all nine specialties in %s while preserving API values", async (locale, expected) => {
        render(<Page locale={locale} />);
        const name = getLocalUiTranslation(UI_LABELS_FR.appointmentsPage.specialist.specialtyChoose, locale)!;
        const select = screen.getByRole("combobox", { name });
        for (const [index, label] of expected.entries()) {
            expect(within(select).getByRole("option", { name: label })).toHaveValue(SPECIALTIES[index]);
            expect(getLocalUiTranslation(UI_LABELS_FR.appointmentSpecialties[SPECIALTIES[index]], locale)).toBe(label);
        }
        await waitFor(() => expect(api.clinics).toHaveBeenCalledOnce());
    });

    it("keeps the selected API specialty and translates its feedback after a language switch", async () => {
        const { rerender } = render(<Page locale="en-CA" selected />);
        const select = screen.getByRole("combobox", { name: "Choose a specialty *" });
        await waitFor(() => expect(select).toBeEnabled());
        fireEvent.change(select, { target: { value: "Medecin de famille" } });
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("Family Physician");
        expect(api.recommendation).toHaveBeenCalledExactlyOnceWith("synthetic-patient", "Medecin de famille", "synthetic-clinic");
        rerender(<Page locale="ja" selected />);
        expect(select).toHaveValue("Medecin de famille");
        expect(alert).toHaveTextContent("家庭医");
        expect(alert).not.toHaveTextContent("Medecin de famille");
        expect(api.recommendation).toHaveBeenCalledTimes(1);
    });
});
