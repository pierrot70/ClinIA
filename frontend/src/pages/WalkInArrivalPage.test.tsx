import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { receptionReplanLabels, receptionReplanTranslations } from "../i18n/receptionReplanLabels";
import { WalkInArrivalPage } from "./WalkInArrivalPage";
import { urgentologistLabels, urgentologistTranslations, walkInEmergencyReminder } from "../i18n/urgentologistLabels";
import { displaySpecialty } from "../i18n/specialtyLabels";
import { receptionLabel } from "../i18n/receptionLabels";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";

const api = vi.hoisted(() => ({ lookup: vi.fn(), slots: vi.fn(), book: vi.fn() }));
vi.mock("../services/receptionApi", () => ({ findReceptionPatientByRamq: api.lookup, fetchWalkInAvailability: api.slots, createWalkInBooking: api.book }));
vi.mock("../contexts/ReceptionClinicContext", () => ({ useReceptionClinic: () => ({ activeClinic: { _id: "clinic", nom: "Test clinic" }, isLoading: false }) }));
function Page({ locale = "en-CA" }: { locale?: string }) {
    return <HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR, isTranslating: false, setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}>
        <WalkInArrivalPage />
    </HomeI18nContext.Provider>;
}
const original = { _id: "original", date: "2030-01-01", time: "08:00" };
beforeEach(() => {
    vi.clearAllMocks();
    api.lookup.mockResolvedValue({ data: { _id: "patient", prenom: "Test", nom: "Patient", existingAppointments: [original] } });
    api.slots.mockResolvedValue({ data: { today: [{ specialist: { _id: "doctor", prenom: "Test", nom: "Doctor" }, date: "2030-01-01", slots: ["08:15"] }], future: [] } });
    api.book.mockResolvedValue({ data: { appointment: { _id: "new" } } });
});
afterEach(cleanup);
describe("availability button label", () => {
    it.each(["fr", "en", "es", "ko", "vi", "no", "ja", "zh", "he"])("switches from view to refresh for existing patients in %s", async locale => {
        api.lookup.mockResolvedValue({ data: { _id: "patient", prenom: "Test", nom: "Patient", existingAppointments: [] } });
        const { rerender } = render(<Page />);
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "676767" } });
        fireEvent.click(screen.getByRole("button", { name: "Search for patient" }));
        fireEvent.click(await screen.findByRole("button", { name: /Select/ }));
        rerender(<Page locale={locale} />);
        const source = UI_LABELS_FR.walkInArrival;
        const view = receptionLabel(locale, "searchAvailability", source.searchAvailability);
        const refresh = receptionLabel(locale, "refreshAvailability", source.refreshAvailability);
        fireEvent.click(screen.getByRole("button", { name: view }));
        expect(await screen.findByRole("button", { name: refresh })).toBeEnabled();
        expect(screen.queryByRole("button", { name: view })).not.toBeInTheDocument();
        expect(api.slots).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole("button", { name: refresh }));
        await screen.findByRole("button", { name: refresh });
        expect(api.slots).toHaveBeenCalledTimes(2);
        expect(api.book).not.toHaveBeenCalled();
    });
    it("shows refresh after automatic new-patient loading and replaces stale slots", async () => {
        api.lookup.mockResolvedValue({ data: null });
        render(<Page />);
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "676767" } });
        fireEvent.click(screen.getByRole("button", { name: "Search for patient" }));
        await screen.findByRole("button", { name: "Refresh available appointments" });
        expect(screen.getByRole("button", { name: /08:15/ })).toBeInTheDocument();
        api.slots.mockResolvedValue({ data: { today: [], future: [] } });
        fireEvent.click(screen.getByRole("button", { name: "Refresh available appointments" }));
        await screen.findByRole("button", { name: "Refresh available appointments" });
        expect(screen.queryByRole("button", { name: /08:15/ })).not.toBeInTheDocument();
        expect(api.slots).toHaveBeenCalledTimes(2);
        expect(api.book).not.toHaveBeenCalled();
    });
});
describe("urgentologist capacity fallback", () => {
    it.each(["fr", "en", "es", "ko", "vi", "no", "ja", "zh", "he"])("keeps the medical reminder in English above both choices in %s", async locale => {
        api.slots.mockResolvedValue({ data: { presentation: "alternatives", today: [], future: [] } });
        const { rerender } = render(<Page />); await lookup();
        fireEvent.click(screen.getByRole("button", { name: "Reschedule this appointment" }));
        await screen.findByText(walkInEmergencyReminder.text);
        rerender(<Page locale={locale} />);
        const reminder = screen.getByText(walkInEmergencyReminder.text);
        expect(reminder).toHaveAttribute("role", "alert");
        expect(reminder).toHaveAttribute("lang", "en");
        expect(reminder).toHaveAttribute("translate", "no");
        expect(reminder).toHaveAttribute("data-content-kind", "medical");
        expect(reminder).toHaveClass("font-bold", "text-red-700");
        const labels = urgentologistLabels(locale);
        const tomorrow = screen.getByRole("button", { name: labels.tomorrow });
        expect(reminder.compareDocumentPosition(tomorrow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        fireEvent.click(tomorrow);
        expect(screen.getByText(walkInEmergencyReminder.text)).toBeVisible();
        fireEvent.click(screen.getByRole("button", { name: labels.family }));
        expect(screen.getAllByText(walkInEmergencyReminder.text)).toHaveLength(1);
        expect(screen.getByText(walkInEmergencyReminder.text)).toBeVisible();
        expect(api.book).not.toHaveBeenCalled();
    });
    it("shows only today's urgent slots without the future-family section", async () => {
        api.slots.mockResolvedValue({ data: { presentation: "urgent_today", today: [{ specialist: { _id: "urgent", nom: "Urgent", specialty: "Urgentologue" }, date: "2030-01-01", slots: ["12:00"] }], future: [] } });
        render(<Page />); await lookup();
        fireEvent.click(screen.getByRole("button", { name: "Reschedule this appointment" }));
        expect(await screen.findByRole("button", { name: /12:00/ })).toBeInTheDocument();
        expect(screen.queryByText("Next available appointments")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: urgentologistLabels("en").family })).not.toBeInTheDocument();
    });
    it.each(Object.keys(urgentologistTranslations))("requires the family choice when no urgent slot remains, without claiming quota reached (%s)", async locale => {
        api.slots.mockResolvedValue({ data: { presentation: "alternatives", urgentologists: { limit: 20, day: "2030-01-01", allAtCapacity: false }, today: [], future: [{ specialist: { _id: "family", nom: "Family" }, date: "2030-01-02", slots: ["09:00"] }] } });
        const { rerender } = render(<Page />); await lookup();
        fireEvent.click(screen.getByRole("button", { name: "Reschedule this appointment" }));
        await screen.findByText(urgentologistLabels("en").unavailableToday);
        rerender(<Page locale={locale} />);
        const labels = urgentologistLabels(locale);
        expect(screen.getByText(labels.unavailableToday)).toBeInTheDocument();
        expect(screen.queryByText(labels.full)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /09:00/ })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: labels.family }));
        expect(screen.getByRole("button", { name: /09:00/ })).toBeInTheDocument();
        expect(screen.getByText("2030-01-02")).toBeInTheDocument();
        expect(api.book).not.toHaveBeenCalled();
    });
    it.each(Object.keys(urgentologistTranslations))("displays the server's temporary limit of 1 in %s", async locale => {
        api.slots.mockResolvedValue({ data: { urgentologists: { limit: 1, day: "2030-01-01", allAtCapacity: true }, today: [], future: [] } });
        const { rerender } = render(<Page />);
        await lookup();
        fireEvent.click(screen.getByRole("button", { name: "Reschedule this appointment" }));
        await screen.findByText(urgentologistLabels("en", 1).full);
        rerender(<Page locale={locale} />);
        expect(screen.getByText(urgentologistLabels(locale, 1).full)).toBeInTheDocument();
        expect(screen.queryByText(urgentologistLabels(locale, 20).full)).not.toBeInTheDocument();
    });
    it.each(Object.keys(urgentologistTranslations))("offers administrative alternatives in %s without creating a booking", async locale => {
        api.slots.mockResolvedValue({ data: { urgentologists: { limit: 20, day: "2030-01-01", allAtCapacity: true },
            today: [{ specialist: { _id: "family", prenom: "Family", nom: "Doctor" }, date: "2030-01-01", slots: ["09:00"] }],
            future: [{ specialist: { _id: "urgent", nom: "Emergency", specialty: "Urgentologue" }, date: "2030-01-02", slots: ["10:00"] }] } });
        const { rerender } = render(<Page />);
        await lookup();
        fireEvent.click(screen.getByRole("button", { name: "Reschedule this appointment" }));
        await screen.findByText(urgentologistLabels("en").full);
        rerender(<Page locale={locale} />);
        const labels = urgentologistLabels(locale);
        expect(screen.getByText(labels.full)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: labels.tomorrow }));
        expect(screen.getByText(labels.tomorrowNotice)).toBeInTheDocument();
        expect(api.book).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: labels.family }));
        expect(screen.getByRole("button", { name: /09:00/ })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /10:00/ })).not.toBeInTheDocument();
        expect(displaySpecialty("Urgentologue", locale)).toBe("Emergency Physician");
    });
});
async function lookup() {
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "676767" } });
    fireEvent.click(screen.getByRole("button", { name: "Search for patient" }));
    await screen.findByText(/An appointment is already scheduled/);
}
async function choose() {
    fireEvent.click(screen.getByRole("button", { name: "Reschedule this appointment" }));
    fireEvent.click(await screen.findByRole("button", { name: /08:15/ }));
}
describe("reception rescheduling", () => {
    it.each(Object.keys(receptionReplanTranslations))("shows the patient identity conflict in %s", async locale => {
        api.lookup.mockResolvedValue({ data: null });
        api.book.mockResolvedValue({ error: { code: "PATIENT_ALREADY_EXISTS", message: "RAW_SERVER_MESSAGE" } });
        const { rerender } = render(<Page />);
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "676767" } });
        fireEvent.click(screen.getByRole("button", { name: "Search for patient" }));
        fireEvent.click(await screen.findByRole("button", { name: /08:15/ }));
        fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Test" } });
        fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Patient" } });
        rerender(<Page locale={locale} />);
        const source = UI_LABELS_FR.walkInArrival;
        fireEvent.click(screen.getByRole("button", { name: receptionLabel(locale, "createPatientAndAppointment", source.createPatientAndAppointment) }));
        expect(await screen.findByRole("alert")).toHaveTextContent(receptionReplanLabels(locale).patientExists);
        expect(screen.queryByText("RAW_SERVER_MESSAGE")).not.toBeInTheDocument();
    });
    it("warns immediately and does not offer a second appointment or mutate while searching", async () => {
        render(<Page />); await lookup();
        expect(screen.queryByRole("button", { name: "View available appointments" })).not.toBeInTheDocument();
        expect(api.slots).not.toHaveBeenCalled(); expect(api.book).not.toHaveBeenCalled();
        await choose();
        expect(api.slots).toHaveBeenCalledWith("clinic", "patient", "original");
        expect(screen.getByText(receptionReplanLabels("en").kept)).toBeInTheDocument();
        expect(api.book).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Confirm appointment replacement" }));
        await screen.findByText(receptionReplanLabels("en").success);
        expect(api.book).toHaveBeenCalledWith(expect.objectContaining({ patientId: "patient", replaceAppointmentId: "original", time: "08:15" }));
    });
    it("keeps a failed replacement on the confirmation screen without reporting success", async () => {
        api.book.mockResolvedValue({ error: { code: "RECEPTION_REPLAN_REQUIRED" } });
        render(<Page />); await lookup(); await choose();
        fireEvent.click(screen.getByRole("button", { name: "Confirm appointment replacement" }));
        expect(await screen.findByRole("alert")).toHaveTextContent(receptionReplanLabels("en").conflict);
        expect(screen.queryByText(receptionReplanLabels("en").success)).not.toBeInTheDocument();
    });
    it("blocks ambiguous existing duplicates without choosing one automatically", async () => {
        api.lookup.mockResolvedValue({ data: { _id: "patient", prenom: "Test", nom: "Patient", existingAppointments: [original, { ...original, _id: "other" }] } });
        render(<Page />);
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "676767" } });
        fireEvent.click(screen.getByRole("button", { name: "Search for patient" }));
        await screen.findByText(receptionReplanLabels("en").conflict);
        expect(screen.queryByRole("button", { name: "Reschedule this appointment" })).not.toBeInTheDocument();
        expect(api.book).not.toHaveBeenCalled();
    });
    it.each(Object.keys(receptionReplanTranslations))("updates rescheduling labels in %s", async locale => {
        const { rerender } = render(<Page />); await lookup();
        rerender(<Page locale={locale} />);
        const labels = receptionReplanLabels(locale);
        expect(Object.keys(labels).sort()).toEqual(Object.keys(receptionReplanTranslations.fr).sort());
        expect(screen.getByRole("button", { name: labels.start })).toBeInTheDocument();
        expect(screen.getByText(labels.notice.replace("{date}", original.date).replace("{time}", original.time))).toBeInTheDocument();
    });
    it("clears the selected patient and replacement when the insurance input changes", async () => {
        render(<Page />); await lookup();
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "787878" } });
        await waitFor(() => expect(screen.queryByText(/An appointment is already scheduled/)).not.toBeInTheDocument());
        expect(api.book).not.toHaveBeenCalled();
    });
});
