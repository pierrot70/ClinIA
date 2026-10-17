import { SPECIALTIES } from "../data/specialties";
import { UI_LOCALES } from "../i18n/uiLocales";
import { appointmentSpecialtyLabel } from "../i18n/appointmentSpecialtyLabels";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { UI_LABELS_FR as labels } from "../i18n/uiLabels.fr";
import { getLocalUiTranslation } from "../i18n/localUiTranslations";
import { AppointmentsListPage } from "./AppointmentsList";

const api = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn(), clinics: vi.fn(), specialists: vi.fn() }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ user: { role: "MEDECIN" } }) }));
vi.mock("../services/appointmentsApi", () => ({
    fetchAppointmentsPaginated: api.list, updateAppointmentStatus: api.update,
    fetchAvailableSlots: vi.fn(), fetchRescheduleRecommendation: vi.fn(), rescheduleAppointment: vi.fn(),
    requestSpecialistAvailability: vi.fn(), fetchSpecialistAvailabilityRequests: vi.fn(),
    resolveSpecialistAvailabilityRequest: vi.fn(), updateAppointmentSchedule: vi.fn(),
}));
vi.mock("../services/cliniqueApi", () => ({ fetchCliniquesPaginated: api.clinics }));
vi.mock("../services/specialistsApi", () => ({ fetchSpecialistsPaginated: api.specialists }));

function Page({ locale }: { locale: string }) {
    return <MemoryRouter><HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR,
        isTranslating: false, setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}>
        <AppointmentsListPage />
    </HomeI18nContext.Provider></MemoryRouter>;
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const meta = { page: 1, limit: 10, total: 1, totalPages: 1 };
    api.clinics.mockResolvedValue({ data: { data: [{ _id: "synthetic-clinic", nom: "Clinique synthétique" }], meta } });
    api.specialists.mockResolvedValue({ data: { data: [], meta } });
    api.list.mockResolvedValue({ data: { data: [{ _id: "synthetic-appointment", patientName: "Patient synthétique",
        specialist: "synthetic-specialist", clinique: "synthetic-clinic", date: "2026-10-10", time: "10:00", status: "scheduled" }], meta } });
    api.update.mockResolvedValue({ data: {}, meta: { writeVerification: { status: "CONFIRMED", verificationId: "SYNTHETIC-RECEIPT-123" } } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("appointment feedback follows the selected language", () => {
    it("updates the confirmation and receipt wording after saving while retaining identifiers", async () => {
        const { rerender } = render(<Page locale="fr-CA" />);
        const row = await screen.findByRole("row", { name: /Patient synthétique/ });
        fireEvent.click(within(row).getByRole("button", { name: labels.appointmentsList.actions.markCompleted }));
        const toast = await screen.findByRole("status");
        for (const locale of ["fr-CA", "en-CA", "es"]) {
            rerender(<Page locale={locale} />);
            expect(toast).toHaveTextContent(getLocalUiTranslation(labels.appointmentsList.feedback.completed, locale)!);
            expect(toast).toHaveTextContent(getLocalUiTranslation(labels.pageUi.verificationNumber, locale)!);
            expect(toast).toHaveTextContent("SYNTHETIC-RECEIPT-123");
            expect(screen.getByRole("cell", { name: "Patient synthétique" })).toBeInTheDocument();
            expect(screen.getByRole("cell", { name: "Clinique synthétique" })).toBeInTheDocument();
        }
        expect(api.update).toHaveBeenCalledExactlyOnceWith("synthetic-appointment", "completed");
    });

    it("localizes an unknown server error instead of displaying French prose", async () => {
        api.update.mockResolvedValue({ error: { code: "INTERNAL_ERROR", message: "Erreur serveur synthétique non répertoriée" } });
        render(<Page locale="en-CA" />);
        const row = await screen.findByRole("row", { name: /Patient synthétique/ });
        fireEvent.click(within(row).getByRole("button", { name: "Complete" }));
        const toast = await screen.findByRole("status");
        expect(toast).toHaveTextContent(getLocalUiTranslation(labels.generalUi.error, "en-CA")!);
        expect(screen.queryByText("Erreur serveur synthétique non répertoriée")).not.toBeInTheDocument();
    });
});

describe("appointment list specialty translations", () => {
    function mockSpecialties() {
        const meta = { page: 1, limit: 10, total: 9, totalPages: 1 };
        api.specialists.mockResolvedValue({ data: { data: SPECIALTIES.map((specialite, i) => ({ _id: `specialist-${i}`,
            prenom: `First${i}`, nom: `Last${i}`, numero_medecin: `SYNTHETIC-${i}`, specialite })), meta } });
        api.list.mockResolvedValue({ data: { data: SPECIALTIES.map((_, i) => ({ _id: `appointment-${i}`,
            patientName: `Synthetic patient ${i}`, specialist: `specialist-${i}`, clinique: "synthetic-clinic",
            date: "2026-10-17", time: "10:00", status: "scheduled" })), meta } });
    }
    it.each(UI_LOCALES)("translates specialties in rows and specialist filter options in %s", async locale => {
        mockSpecialties();
        render(<Page locale={locale} />);
        for (const [index, specialty] of SPECIALTIES.entries()) {
            const name = appointmentSpecialtyLabel(specialty, locale);
            const option = await screen.findByRole("option", { name: `First${index} Last${index} — ${name}` });
            expect(option).toHaveValue(`specialist-${index}`);
            const row = await screen.findByRole("row", { name: new RegExp(`Synthetic patient ${index}`) });
            expect(within(row).getByRole("cell", { name })).toBeVisible();
        }
        expect(api.update).not.toHaveBeenCalled();
    });
    it("preserves the specialist identifier when switching language and filtering appointments", async () => {
        mockSpecialties();
        const { rerender } = render(<Page locale="en-CA" />);
        const option = await screen.findByRole("option", { name: "First1 Last1 — Emergency Physician" });
        const select = option.closest("select")!;
        fireEvent.change(select, { target: { value: "specialist-1" } });
        rerender(<Page locale="ja" />);
        expect(select).toHaveValue("specialist-1");
        expect(screen.getByRole("option", { name: "First1 Last1 — 救急医" })).toHaveProperty("selected", true);
        await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ specialist: "specialist-1" })));
        expect(api.update).not.toHaveBeenCalled();
    });
});
