import { installNativeDialogTestSupport } from "../testUtils/nativeDialog";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { WalkInArrivalPage } from "./WalkInArrivalPage";

const transport = vi.hoisted(() => ({ authFetch: vi.fn(), lookup: vi.fn(), query: vi.fn(), attendance: vi.fn(), book: vi.fn() }));
const clinic = vi.hoisted(() => ({ activeClinic: { _id: "clinic-test", nom: "Clinique fictive" }, isLoading: false }));
vi.mock("../services/authService", () => ({ authFetch: transport.authFetch }));
vi.mock("../contexts/ReceptionClinicContext", () => ({ useReceptionClinic: () => clinic }));
const text = UI_LABELS_FR.receptionAttendance;
const person = { _id: "patient-test", prenom: "Test", nom: "Fictif", bookingProof: "proof-initial", existingAppointments: [], hasHistoricalScheduledAppointments: true };
function Page() { return <HomeI18nContext.Provider value={{ locale: "fr-CA", strings: HOME_STRINGS_FR, isTranslating: false, setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}><WalkInArrivalPage /></HomeI18nContext.Provider>; }
function insurance(value = "TEST-SYNTHETIC") { fireEvent.change(screen.getByLabelText("Numéro d'assurance maladie"), { target: { value } }); }
async function pause() { await act(async () => { await vi.advanceTimersByTimeAsync(650); }); }
function click(name: string) { fireEvent.click(screen.getByRole("button", { name })); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

let restoreDialog: () => void;
beforeEach(() => {
    restoreDialog = installNativeDialogTestSupport();
    vi.clearAllMocks(); vi.useFakeTimers();
    clinic.activeClinic = { _id: "clinic-test", nom: "Clinique fictive" };
    transport.lookup.mockResolvedValue({ data: person });
    transport.query.mockResolvedValue({ data: { appointments: [{ _id: "old-1", date: "2030-01-01", time: "09:00" }], hasMore: false } });
    transport.authFetch.mockImplementation(async (url: string, init?: RequestInit) => {
        const path = new URL(url, "http://clinia.test").pathname;
        let result;
        if (path.endsWith("/patient-lookup")) result = await transport.lookup();
        else if (path.endsWith("/historical-appointments/query")) result = await transport.query(init);
        else if (path.endsWith("/attendance")) result = await transport.attendance(init);
        else if (path.endsWith("/walk-in-options")) result = { data: { today: [{ specialist: { _id: "doctor-test", prenom: "Médecin", nom: "Fictif" }, date: "2030-02-01", slots: ["10:00"] }], future: [] } };
        else if (path.endsWith("/walk-in-bookings")) result = await transport.book(init);
        else throw new Error("Unexpected endpoint");
        return { json: async () => result };
    });
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected direct network call"); }));
});
afterEach(() => { cleanup(); restoreDialog(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("automatic reception attendance prompt", () => {
    it("debounces typing and opens only the identity prompt, with no history or write request", async () => {
        render(<Page />); insurance("123"); await pause();
        expect(transport.authFetch).not.toHaveBeenCalled();
        insurance("123456"); await pause();
        expect(screen.getByRole("dialog", { name: text.title })).toBeVisible();
        expect(screen.getByText(text.identityPrompt)).toBeVisible();
        expect(transport.authFetch).toHaveBeenCalledTimes(1);
        expect(transport.query).not.toHaveBeenCalled();
        expect(transport.attendance).not.toHaveBeenCalled();
        click(text.postpone); await pause();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(transport.authFetch).toHaveBeenCalledTimes(1);
    });
    it.each([null, { ...person, hasHistoricalScheduledAppointments: false }])("never opens a prompt or availability for an automatic match without unresolved history", async data => {
        transport.lookup.mockResolvedValue({ data });
        render(<Page />); insurance(); await pause();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(transport.authFetch).toHaveBeenCalledTimes(1);
        expect(transport.query).not.toHaveBeenCalled();
        expect(transport.book).not.toHaveBeenCalled();
    });
    it("does not duplicate a manual search when its debounce timer completes", async () => {
        render(<Page />); insurance();
        await act(async () => { click("Rechercher le patient"); });
        await pause();
        expect(transport.lookup).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("dialog", { name: text.title })).toBeVisible();
    });
    it("ignores a late response for a different insurance identity", async () => {
        const pending = deferred<{ data: typeof person }>();
        transport.lookup.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ data: { ...person, _id: "other-test", hasHistoricalScheduledAppointments: false } });
        render(<Page />); insurance("FIRST-TEST"); await pause();
        insurance("SECOND-TEST");
        await act(async () => { pending.resolve({ data: person }); });
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await pause();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(transport.query).not.toHaveBeenCalled();
    });
    it("uses the rotated proof for a later normal WalkIn booking and does not re-prompt after regularization", async () => {
        transport.attendance.mockResolvedValue({ data: { appointment: { _id: "old-1", date: "2030-01-01", time: "09:00", attendanceResolution: { outcome: "attended" } }, bookingProof: "proof-rotated" } });
        transport.book.mockResolvedValue({ data: { appointment: { _id: "new-test" } } });
        render(<Page />); insurance(); await pause();
        await act(async () => { click(text.verifyIdentity); });
        click(text.attended);
        expect(transport.attendance).not.toHaveBeenCalled();
        await act(async () => { click(text.confirm); });
        expect(screen.getByText(text.allResolved)).toBeVisible();
        click(text.close);
        await act(async () => { click("Voir les créneaux disponibles"); });
        click("10:00 — Choisir ce créneau");
        await act(async () => { click("Créer le rendez-vous"); });
        const init = transport.book.mock.calls[0][0];
        expect(JSON.parse(init.body)).toMatchObject({ patientId: "patient-test", bookingProof: "proof-rotated" });
        expect(JSON.parse(init.body)).not.toHaveProperty("replaceAppointmentId");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(fetch).not.toHaveBeenCalled();
    });
});
