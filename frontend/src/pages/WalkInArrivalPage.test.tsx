import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { receptionReplanLabels, receptionReplanTranslations } from "../i18n/receptionReplanLabels";
import { WalkInArrivalPage } from "./WalkInArrivalPage";

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
