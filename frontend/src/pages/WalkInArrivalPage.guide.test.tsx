import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { installNativeDialogTestSupport } from "../testUtils/nativeDialog";
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { walkInGuideLabels } from "../i18n/walkInGuideLabels";
import { WalkInArrivalPage } from "./WalkInArrivalPage";

// Exercise the actual reception API adapter. Only its HTTP transport is mocked,
// so the suite can verify every URL/payload produced by the assisted UI.
const transport = vi.hoisted(() => ({ lookup: vi.fn(), slots: vi.fn(), book: vi.fn(), authFetch: vi.fn() }));
const clinic = vi.hoisted(() => ({ activeClinic: { _id: "clinic-test", nom: "Clinique fictive" } as { _id: string; nom: string } | null, isLoading: false }));
vi.mock("../services/authService", () => ({ authFetch: transport.authFetch }));
vi.mock("../contexts/ReceptionClinicContext", () => ({ useReceptionClinic: () => clinic }));

const g = walkInGuideLabels("fr-CA");
const syntheticPatient = { _id: "patient-test", bookingProof: "synthetic-proof", prenom: "Test", nom: "Fictif", existingAppointments: [] };
const syntheticAppointment = { _id: "old-test", date: "2030-01-01", time: "08:00" };

function Page({ locale = "fr-CA" }: { locale?: string }) {
    return <HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR, isTranslating: false, setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}>
        <WalkInArrivalPage />
    </HomeI18nContext.Provider>;
}
function button(name: string) { return screen.getByRole("button", { name }); }
function click(name: string) { fireEvent.click(button(name)); }
function start() { click(g.start); }
function insurance(value = "SYNTHETIC-TEST") {
    fireEvent.change(screen.getByLabelText("Numéro d'assurance maladie"), { target: { value } });
}
async function search() {
    insurance(); click(g.lookupAction);
    await screen.findByRole("heading", { name: g.slotsTitle });
}
async function chooseNew() {
    await search();
    fireEvent.click(await screen.findByRole("button", { name: /08:15/ }));
    await screen.findByRole("heading", { name: g.detailsTitle });
}
function fillNames() {
    fireEvent.change(screen.getByLabelText("Prénom"), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Fictif" } });
    click(g.detailsAction);
}
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
}

let restoreDialog: () => void;
beforeEach(() => {
    restoreDialog = installNativeDialogTestSupport();
    vi.clearAllMocks();
    clinic.activeClinic = { _id: "clinic-test", nom: "Clinique fictive" };
    clinic.isLoading = false;
    transport.lookup.mockResolvedValue({ data: null });
    transport.slots.mockResolvedValue({ data: { today: [{ specialist: { _id: "doctor-test", prenom: "Médecin", nom: "Fictif" }, date: "2030-01-01", slots: ["08:15", "08:30"] }], future: [] } });
    transport.book.mockResolvedValue({ data: { appointment: { _id: "new-test" } } });
    transport.authFetch.mockImplementation(async (url: string, init?: RequestInit) => {
        const parsed = new URL(url, "http://clinia.test");
        let result;
        if (parsed.pathname === "/api/reception/patient-lookup") result = await transport.lookup();
        else if (parsed.pathname === "/api/reception/walk-in-options") result = await transport.slots();
        else if (parsed.pathname === "/api/reception/walk-in-bookings") result = await transport.book(init);
        else throw new Error("Unexpected endpoint in local guide test");
        return { json: async () => result };
    });
    // No unmocked request, including OpenAI, is allowed during the workflow.
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Unexpected direct fetch"))));
});
afterEach(() => { cleanup(); restoreDialog(); vi.unstubAllGlobals(); });

describe("local assisted WalkIn workflow", () => {
    it("starts/stops without any request, focuses the insurance field and restores keyboard focus", () => {
        render(<Page />); start();
        expect(screen.getByLabelText("Numéro d'assurance maladie")).toHaveFocus();
        expect(button(g.lookupAction)).toBeDisabled();
        expect(screen.getByText(g.privacy)).toBeVisible();
        click(g.stop);
        expect(button(g.start)).toHaveFocus();
        expect(transport.authFetch).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });

    it("stops guidance while a requested lookup finishes without launching another guide action", async () => {
        const response = deferred<{ data: typeof syntheticPatient }>();
        transport.lookup.mockReturnValue(response.promise);
        render(<Page />); start(); insurance(); click(g.lookupAction); click(g.stop);
        await act(async () => { response.resolve({ data: syntheticPatient }); });
        expect(button(g.start)).toBeVisible();
        expect(transport.authFetch).toHaveBeenCalledTimes(1);
        expect(transport.slots).not.toHaveBeenCalled();
        expect(transport.book).not.toHaveBeenCalled();
    });

    it("runs the new-patient path through ClinIA only and never submits via a guide action", async () => {
        const user = userEvent.setup();
        render(<Page />); start(); await chooseNew();
        expect(screen.getByLabelText("Prénom")).toHaveValue("");
        expect(screen.getByLabelText("Nom")).toHaveValue("");
        click(g.detailsAction);
        expect(screen.getByLabelText("Prénom")).toHaveFocus();
        await act(async () => { await user.type(screen.getByLabelText("Prénom"), "Test complet"); });
        expect(screen.getByLabelText("Prénom")).toHaveFocus();
        click(g.detailsAction);
        expect(screen.getByLabelText("Nom")).toHaveFocus();
        await act(async () => { await user.type(screen.getByLabelText("Nom"), "Fictif complet"); });
        expect(screen.getByLabelText("Nom")).toHaveFocus();
        click(g.detailsAction);
        click(g.reviewAction);
        expect(button("Créer le patient et le rendez-vous")).toHaveFocus();
        expect(screen.getByLabelText("Prénom")).toHaveValue("Test complet");
        expect(screen.getByLabelText("Nom")).toHaveValue("Fictif complet");
        expect(transport.book).not.toHaveBeenCalled();
        // Only the existing final confirmation button performs the write.
        click("Créer le patient et le rendez-vous");
        await screen.findByRole("heading", { name: g.doneTitle });
        expect(transport.book).toHaveBeenCalledTimes(1);
        const calls = transport.authFetch.mock.calls;
        expect(calls.map(([url]) => new URL(url, "http://clinia.test").pathname)).toEqual([
            "/api/reception/patient-lookup", "/api/reception/walk-in-options", "/api/reception/walk-in-bookings",
        ]);
        const payload = JSON.parse(calls[2][1].body);
        expect(payload.patient).toMatchObject({ prenom: "Test complet", nom: "Fictif complet", num_assurance_maladie: "SYNTHETIC-TEST" });
        expect(payload.time).toBe("08:15");
        expect(fetch).not.toHaveBeenCalled();
        click(g.doneAction);
        expect(screen.getByRole("heading", { name: g.lookupTitle })).toBeVisible();
        expect(transport.authFetch).toHaveBeenCalledTimes(3);
    });

    it("requires an explicit identity check and slot choice for an existing patient", async () => {
        transport.lookup.mockResolvedValue({ data: syntheticPatient });
        render(<Page />); start(); insurance(); click(g.lookupAction);
        await screen.findByRole("heading", { name: g.identityTitle });
        expect(transport.slots).not.toHaveBeenCalled();
        expect(transport.book).not.toHaveBeenCalled();
        click(g.identityAction);
        expect(screen.getByRole("heading", { name: g.availabilityTitle })).toBeVisible();
        click(g.availabilityAction);
        await screen.findByRole("heading", { name: g.slotsTitle });
        click(g.slotsAction);
        expect(transport.book).not.toHaveBeenCalled();
        expect(screen.queryByRole("heading", { name: g.reviewTitle })).not.toBeInTheDocument();
        fireEvent.click(button("08:30 — Choisir ce créneau"));
        click(g.reviewAction);
        expect(button("Créer le rendez-vous")).toHaveFocus();
        expect(transport.book).not.toHaveBeenCalled();
        click("Créer le rendez-vous");
        await screen.findByRole("heading", { name: g.doneTitle });
        expect(JSON.parse(transport.authFetch.mock.calls.at(-1)![1].body)).toMatchObject({ patientId: "patient-test", bookingProof: "synthetic-proof", time: "08:30" });
    });

    it("keeps an existing appointment until the separate explicit replacement confirmation", async () => {
        transport.lookup.mockResolvedValue({ data: { ...syntheticPatient, existingAppointments: [syntheticAppointment] } });
        render(<Page />); start(); insurance(); click(g.lookupAction);
        await screen.findByRole("heading", { name: g.identityTitle }); click(g.identityAction);
        expect(screen.getByRole("heading", { name: g.existingTitle })).toBeVisible();
        expect(document.activeElement).toHaveTextContent("2030-01-01");
        click(g.existingAction);
        fireEvent.click(await screen.findByRole("button", { name: /08:15/ }));
        click(g.reviewAction);
        expect(transport.book).not.toHaveBeenCalled();
        click("Confirmer le remplacement du rendez-vous");
        await screen.findByRole("heading", { name: g.doneTitle });
        expect(JSON.parse(transport.authFetch.mock.calls.at(-1)![1].body)).toMatchObject({ replaceAppointmentId: "old-test", patientId: "patient-test" });
    });

    it("does not choose among duplicate existing appointments", async () => {
        transport.lookup.mockResolvedValue({ data: { ...syntheticPatient, existingAppointments: [syntheticAppointment, { ...syntheticAppointment, _id: "other-test" }] } });
        render(<Page />); start(); insurance(); click(g.lookupAction);
        await screen.findByRole("heading", { name: g.identityTitle }); click(g.identityAction);
        expect(screen.getByRole("heading", { name: g.ambiguousTitle })).toBeVisible();
        expect(transport.slots).not.toHaveBeenCalled();
        expect(transport.book).not.toHaveBeenCalled();
    });


    it("starts a new arrival for unresolved historical appointments without replacing history or auto-saving", async () => {
        transport.lookup.mockResolvedValue({ data: { ...syntheticPatient, hasHistoricalScheduledAppointments: true } });
        render(<Page />); start(); insurance(); click(g.lookupAction);
        await screen.findByRole("dialog", { name: UI_LABELS_FR.receptionAttendance.title });
        click(UI_LABELS_FR.receptionAttendance.postpone);
        await screen.findByRole("heading", { name: g.identityTitle });
        expect(screen.queryByText(/Ancien rendez-vous au statut non régularisé/)).not.toBeInTheDocument();
        click(g.identityAction);
        expect(screen.getByText(/Ancien rendez-vous au statut non régularisé/)).toBeVisible();
        expect(screen.queryByText(/Le rendez-vous initial reste réservé/)).not.toBeInTheDocument();
        click("Enregistrer une nouvelle arrivée");
        fireEvent.click(await screen.findByRole("button", { name: /08:15/ }));
        expect(screen.getByText(/Une date passée ne confirme pas une absence/)).toBeVisible();
        click(g.reviewAction);
        expect(button("Créer le rendez-vous")).toHaveFocus();
        expect(transport.book).not.toHaveBeenCalled();
        click("Créer le rendez-vous");
        await screen.findByRole("heading", { name: g.doneTitle });
        const payload = JSON.parse(transport.authFetch.mock.calls.at(-1)![1].body);
        expect(payload).toMatchObject({ patientId: "patient-test", bookingProof: "synthetic-proof" });
        expect(payload).not.toHaveProperty("replaceAppointmentId");
        expect(payload).not.toHaveProperty("patient");
        expect(fetch).not.toHaveBeenCalled();
    });

    it("keeps a current reservation protected even when there is unresolved history", async () => {
        transport.lookup.mockResolvedValue({ data: { ...syntheticPatient, hasHistoricalScheduledAppointments: true, existingAppointments: [syntheticAppointment] } });
        render(<Page />); start(); insurance(); click(g.lookupAction);
        await screen.findByRole("dialog", { name: UI_LABELS_FR.receptionAttendance.title });
        click(UI_LABELS_FR.receptionAttendance.postpone);
        await screen.findByRole("heading", { name: g.identityTitle }); click(g.identityAction);
        expect(screen.getByRole("heading", { name: g.existingTitle })).toBeVisible();
        expect(screen.getByText(/Le rendez-vous initial reste réservé/)).toBeVisible();
        expect(screen.queryByRole("button", { name: "Enregistrer une nouvelle arrivée" })).not.toBeInTheDocument();
        expect(transport.slots).not.toHaveBeenCalled();
        expect(transport.book).not.toHaveBeenCalled();
    });

    it("keeps current duplicates blocked without claiming there is one original reservation", async () => {
        transport.lookup.mockResolvedValue({ data: { ...syntheticPatient, hasHistoricalScheduledAppointments: true, existingAppointments: [syntheticAppointment, { ...syntheticAppointment, _id: "other-test" }] } });
        render(<Page />); start(); insurance(); click(g.lookupAction);
        await screen.findByRole("dialog", { name: UI_LABELS_FR.receptionAttendance.title });
        click(UI_LABELS_FR.receptionAttendance.postpone);
        await screen.findByRole("heading", { name: g.identityTitle }); click(g.identityAction);
        expect(screen.getByRole("heading", { name: g.ambiguousTitle })).toBeVisible();
        expect(screen.queryByText(/Le rendez-vous initial reste réservé/)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Enregistrer une nouvelle arrivée" })).not.toBeInTheDocument();
        expect(transport.slots).not.toHaveBeenCalled();
        expect(transport.book).not.toHaveBeenCalled();
    });

    it("clears the historical notice and new-arrival action when the insurance identity changes", async () => {
        transport.lookup.mockResolvedValue({ data: { ...syntheticPatient, hasHistoricalScheduledAppointments: true } });
        render(<Page />); start(); insurance(); click(g.lookupAction);
        await screen.findByRole("dialog", { name: UI_LABELS_FR.receptionAttendance.title });
        click(UI_LABELS_FR.receptionAttendance.postpone);
        await screen.findByRole("heading", { name: g.identityTitle }); click(g.identityAction);
        expect(button("Enregistrer une nouvelle arrivée")).toBeEnabled();
        insurance("OTHER-SYNTHETIC");
        expect(screen.queryByText(/Ancien rendez-vous au statut non régularisé/)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Enregistrer une nouvelle arrivée" })).not.toBeInTheDocument();
        expect(transport.slots).not.toHaveBeenCalled();
    });

    it("can stop on the form without changing its values or issuing further requests", async () => {
        render(<Page />); start(); await chooseNew(); fillNames();
        const calls = transport.authFetch.mock.calls.length;
        click(g.stop);
        expect(screen.getByLabelText("Prénom")).toHaveValue("Test");
        expect(screen.getByLabelText("Nom")).toHaveValue("Fictif");
        expect(transport.authFetch).toHaveBeenCalledTimes(calls);
        expect(transport.book).not.toHaveBeenCalled();
        start(); click(g.reviewAction);
        expect(transport.book).not.toHaveBeenCalled();
    });

    it("blocks repeated guided searches while pending and ignores a stale response after RAMQ changes", async () => {
        const response = deferred<{ data: typeof syntheticPatient }>();
        transport.lookup.mockReturnValue(response.promise);
        render(<Page />); start(); insurance();
        const action = button(g.lookupAction);
        fireEvent.click(action); fireEvent.click(action);
        expect(transport.lookup).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("heading", { name: g.busyTitle })).toBeVisible();
        insurance("OTHER-SYNTHETIC");
        await act(async () => { response.resolve({ data: syntheticPatient }); });
        expect(screen.queryByText("Test Fictif")).not.toBeInTheDocument();
        expect(screen.getByRole("heading", { name: g.lookupTitle })).toBeVisible();
        expect(transport.slots).not.toHaveBeenCalled();
    });

    it("stops and clears the prior context on clinic changes, ignoring in-flight results", async () => {
        const response = deferred<{ data: typeof syntheticPatient }>();
        transport.lookup.mockReturnValue(response.promise);
        const { rerender } = render(<Page />); start(); insurance(); click(g.lookupAction);
        clinic.activeClinic = { _id: "other-clinic-test", nom: "Autre clinique fictive" };
        rerender(<Page />);
        await act(async () => { response.resolve({ data: syntheticPatient }); });
        expect(button(g.start)).toBeVisible();
        expect(screen.getByLabelText("Numéro d'assurance maladie")).toHaveValue("");
        expect(screen.queryByText("Test Fictif")).not.toBeInTheDocument();
        expect(transport.slots).not.toHaveBeenCalled();
        expect(transport.book).not.toHaveBeenCalled();
    });

    it("discards availability received after the insurance input changes", async () => {
        const response = deferred<{ data: { today: []; future: [] } }>();
        transport.lookup.mockResolvedValue({ data: syntheticPatient });
        transport.slots.mockReturnValue(response.promise);
        render(<Page />); start(); insurance(); click(g.lookupAction);
        await screen.findByRole("heading", { name: g.identityTitle }); click(g.identityAction); click(g.availabilityAction);
        insurance("OTHER-SYNTHETIC");
        await act(async () => { response.resolve({ data: { today: [], future: [] } }); });
        expect(screen.getByRole("heading", { name: g.lookupTitle })).toBeVisible();
        expect(screen.queryByRole("heading", { name: g.slotsTitle })).not.toBeInTheDocument();
        expect(transport.book).not.toHaveBeenCalled();
    });

    it("cannot run a guided search without an active clinic", () => {
        clinic.activeClinic = null;
        render(<Page />); start();
        expect(screen.getByRole("heading", { name: g.clinicTitle })).toBeVisible();
        expect(screen.queryByRole("button", { name: g.lookupAction })).not.toBeInTheDocument();
        expect(transport.authFetch).not.toHaveBeenCalled();
    });

    it.each(["PATIENT_ALREADY_EXISTS", "RECEPTION_REPLAN_REQUIRED"])("returns to fresh identity lookup after %s instead of repeating a stale booking", async code => {
        transport.book.mockResolvedValue({ error: { code, message: "Synthetic conflict" } });
        render(<Page />); start(); await chooseNew(); fillNames();
        click("Créer le patient et le rendez-vous");
        await screen.findByRole("heading", { name: g.lookupProblemTitle });
        const count = transport.authFetch.mock.calls.length;
        click(g.lookupProblemAction);
        expect(screen.getByRole("heading", { name: g.lookupTitle })).toBeVisible();
        expect(screen.getByLabelText("Numéro d'assurance maladie")).toHaveValue("SYNTHETIC-TEST");
        expect(transport.authFetch).toHaveBeenCalledTimes(count);
        expect(screen.queryByRole("button", { name: "Créer le patient et le rendez-vous" })).not.toBeInTheDocument();
        click(g.lookupAction);
        await screen.findByRole("heading", { name: g.slotsTitle });
        expect(transport.lookup).toHaveBeenCalledTimes(2);
        expect(transport.book).toHaveBeenCalledTimes(1);
    });

    it("returns to lookup after a rejected booking proof", async () => {
        transport.lookup.mockResolvedValue({ data: syntheticPatient });
        transport.book.mockResolvedValue({ error: { code: "RECEPTION_LOOKUP_REQUIRED", message: "Synthetic proof rejection" } });
        render(<Page />); start(); insurance(); click(g.lookupAction);
        await screen.findByRole("heading", { name: g.identityTitle }); click(g.identityAction); click(g.availabilityAction);
        fireEvent.click(await screen.findByRole("button", { name: /08:15/ })); click("Créer le rendez-vous");
        await screen.findByRole("heading", { name: g.lookupTitle });
        expect(transport.book).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("heading", { name: g.doneTitle })).not.toBeInTheDocument();
    });

    it("requires fresh identity lookup when an appointment changes before availability is loaded", async () => {
        transport.lookup.mockResolvedValue({ data: { ...syntheticPatient, existingAppointments: [syntheticAppointment] } });
        transport.slots.mockResolvedValue({ error: { code: "RECEPTION_REPLAN_REQUIRED", message: "Synthetic stale appointment" } });
        render(<Page />); start(); insurance(); click(g.lookupAction);
        await screen.findByRole("heading", { name: g.identityTitle }); click(g.identityAction); click(g.existingAction);
        await screen.findByRole("heading", { name: g.lookupProblemTitle });
        click(g.lookupProblemAction);
        expect(screen.getByRole("heading", { name: g.lookupTitle })).toBeVisible();
        expect(screen.getByLabelText("Numéro d'assurance maladie")).toHaveValue("SYNTHETIC-TEST");
        expect(transport.lookup).toHaveBeenCalledTimes(1);
        expect(transport.slots).toHaveBeenCalledTimes(1);
        expect(transport.book).not.toHaveBeenCalled();
    });

    it("offers a fresh availability check after a slot/physician failure, never a silent retry", async () => {
        transport.book.mockResolvedValue({ error: { code: "RECEIVING_PHYSICIAN_UNAVAILABLE", message: "Synthetic physician rejection" } });
        render(<Page />); start(); await chooseNew(); fillNames(); click("Créer le patient et le rendez-vous");
        await screen.findByRole("heading", { name: g.problemTitle });
        click(g.problemAction);
        expect(screen.getByRole("heading", { name: g.availabilityTitle })).toBeVisible();
        expect(transport.slots).toHaveBeenCalledTimes(1);
        click(g.availabilityAction);
        await screen.findByRole("heading", { name: g.slotsTitle });
        expect(transport.slots).toHaveBeenCalledTimes(2);
        expect(transport.book).toHaveBeenCalledTimes(1);
    });

    it("keeps confirmation pending until ClinIA replies and blocks repeated final clicks", async () => {
        const response = deferred<{ data: { appointment: { _id: string } } }>();
        transport.book.mockReturnValue(response.promise);
        render(<Page />); start(); await chooseNew(); fillNames();
        const confirm = button("Créer le patient et le rendez-vous");
        fireEvent.click(confirm); fireEvent.click(confirm);
        expect(transport.book).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("heading", { name: g.busyTitle })).toBeVisible();
        expect(screen.queryByRole("heading", { name: g.doneTitle })).not.toBeInTheDocument();
        await act(async () => { response.resolve({ data: { appointment: { _id: "new-test" } } }); });
        expect(screen.getByRole("heading", { name: g.doneTitle })).toBeVisible();
    });

    it("updates the guide language locally without losing entered values or making requests", () => {
        const { rerender } = render(<Page />); start(); insurance();
        rerender(<Page locale="en-CA" />);
        const en = walkInGuideLabels("en-CA");
        expect(screen.getByRole("heading", { name: en.lookupTitle })).toBeVisible();
        expect(screen.getByText(en.privacy)).toBeVisible();
        expect(screen.getByLabelText("Health insurance number")).toHaveValue("SYNTHETIC-TEST");
        expect(transport.authFetch).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });
});
