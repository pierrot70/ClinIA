import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ReceptionAttendanceDialog, type ReceptionAttendanceDialogProps } from "./ReceptionAttendanceDialog";
import { receptionAttendanceLabels } from "../../i18n/receptionAttendanceLabels";

const api = vi.hoisted(() => ({ history: vi.fn(), save: vi.fn() }));
vi.mock("../../services/receptionApi", () => ({ fetchReceptionHistoricalAppointments: api.history, regularizeReceptionAttendance: api.save }));
const copy = receptionAttendanceLabels("fr-CA");
const first = { _id: "old-1", date: "2026-03-08", time: "01:30" };
const second = { _id: "old-2", date: "2026-03-09", time: "09:00" };
const patient = { _id: "patient-test", prenom: "Essai", nom: "Fictif", bookingProof: "proof-initial", hasHistoricalScheduledAppointments: true };
let props: ReceptionAttendanceDialogProps;
const modalDescriptors = { showModal: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal"), close: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close") };

beforeAll(() => {
    // jsdom does not render the browser's top layer; retain its open/closed state.
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
afterAll(() => {
    for (const key of ["showModal", "close"] as const) {
        const descriptor = modalDescriptors[key];
        if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, key, descriptor);
        else Reflect.deleteProperty(HTMLDialogElement.prototype, key);
    }
});
beforeEach(() => {
    vi.clearAllMocks();
    props = { patient, clinicId: "clinic-test", locale: "fr-CA", onClose: vi.fn(), onIdentityConfirmed: vi.fn(), onUpdated: vi.fn(), onLookupRequired: vi.fn() };
    api.history.mockResolvedValue({ data: { appointments: [first, second], hasMore: false } });
    api.save.mockImplementation(async (appointmentId: string, input: { outcome: string }) => ({ data: { appointment: { ...(appointmentId === first._id ? first : second), attendanceResolution: { outcome: input.outcome } }, bookingProof: "proof-next" } }));
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Unexpected direct request"))));
});
afterEach(() => { cleanup(); expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

function click(label: string) { fireEvent.click(screen.getByRole("button", { name: label })); }
function row(item = first) { return screen.getByRole("heading", { name: copy.appointment.replace("{date}", item.date).replace("{time}", item.time) }).closest("li")!; }
function choose(outcome: "attended" | "notAttended", item = first) { fireEvent.click(within(row(item)).getByRole("button", { name: copy[outcome] })); }
async function identify() { click(copy.verifyIdentity); await screen.findByRole("heading", { name: /2026-03-08/ }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

describe("administrative reception attendance dialog", () => {
    it("shows only identity and administrative meaning before explicit verification, with no query or write", () => {
        render(<ReceptionAttendanceDialog {...props} />);
        expect(screen.getByRole("dialog", { name: copy.title })).toBeVisible();
        expect(screen.getByText("Essai Fictif")).toBeVisible();
        expect(screen.getByText(copy.description)).toBeVisible();
        expect(screen.getByRole("button", { name: copy.verifyIdentity })).toHaveFocus();
        expect(screen.queryByText(/2026-03-08/)).not.toBeInTheDocument();
        expect(api.history).not.toHaveBeenCalled(); expect(api.save).not.toHaveBeenCalled();
        click(copy.postpone);
        expect(props.onClose).toHaveBeenCalledOnce();
        expect(api.history).not.toHaveBeenCalled(); expect(api.save).not.toHaveBeenCalled();
    });

    it("loads minimal history for the exact patient/clinic/proof only after identity verification", async () => {
        render(<ReceptionAttendanceDialog {...props} />); await identify();
        expect(props.onIdentityConfirmed).toHaveBeenCalledWith("patient-test");
        expect(api.history).toHaveBeenCalledExactlyOnceWith({ clinic: "clinic-test", patientId: "patient-test", bookingProof: "proof-initial" });
        expect(row()).toHaveTextContent(copy.question);
        expect(row().querySelector("time")).toHaveAttribute("dateTime", "2026-03-08T01:30");
        expect(api.save).not.toHaveBeenCalled();
    });

    it("requires a separate explicit confirmation after choosing attendance", async () => {
        render(<ReceptionAttendanceDialog {...props} />); await identify(); choose("attended");
        expect(screen.getByText(copy.confirmAttended)).toBeVisible();
        expect(screen.getByRole("button", { name: copy.confirm })).toHaveFocus();
        expect(api.save).not.toHaveBeenCalled();
        click(copy.cancel);
        expect(screen.queryByRole("button", { name: copy.confirm })).not.toBeInTheDocument();
        expect(api.save).not.toHaveBeenCalled();
        choose("attended"); click(copy.confirm);
        await screen.findByText(copy.saved);
        expect(api.save).toHaveBeenCalledExactlyOnceWith("old-1", { clinic: "clinic-test", patientId: "patient-test", bookingProof: "proof-initial", outcome: "attended" });
        expect(props.onUpdated).toHaveBeenLastCalledWith("patient-test", "proof-next", true);
        expect(screen.queryByRole("heading", { name: /2026-03-08/ })).not.toBeInTheDocument();
        expect(row(second)).toBeVisible();
    });

    it("uses the rotated proof for the second outcome and reports completion without clinical statuses", async () => {
        api.save.mockResolvedValueOnce({ data: { appointment: { ...first, attendanceResolution: { outcome: "attended" } }, bookingProof: "proof-second" } })
            .mockResolvedValueOnce({ data: { appointment: { ...second, attendanceResolution: { outcome: "not_attended" } }, bookingProof: "proof-final" } });
        render(<ReceptionAttendanceDialog {...props} />); await identify();
        choose("attended"); click(copy.confirm); await screen.findByText(copy.saved);
        choose("notAttended", second); expect(api.save).toHaveBeenCalledTimes(1);
        click(copy.confirm); await screen.findByText(copy.allResolved);
        expect(api.save.mock.calls[1]).toEqual(["old-2", { clinic: "clinic-test", patientId: "patient-test", bookingProof: "proof-second", outcome: "not_attended" }]);
        api.save.mock.calls.forEach(([, payload]) => expect(payload).not.toHaveProperty("status"));
        expect(props.onUpdated).toHaveBeenLastCalledWith("patient-test", "proof-final", false);
        click(copy.close); expect(props.onClose).toHaveBeenCalledOnce();
    });

    it("moves focus to loaded history, the next remaining appointment and completion without stealing confirmation focus", async () => {
        render(<ReceptionAttendanceDialog {...props} />); await identify();
        expect(row(first)).toHaveFocus();
        choose("attended");
        expect(screen.getByRole("button", { name: copy.confirm })).toHaveFocus();
        click(copy.confirm); await screen.findByText(copy.saved);
        expect(row(second)).toHaveFocus();
        choose("notAttended", second);
        expect(screen.getByRole("button", { name: copy.confirm })).toHaveFocus();
        click(copy.confirm); await screen.findByText(copy.allResolved);
        expect(screen.getByText(copy.allResolved)).toHaveFocus();
    });

    it("blocks duplicate submissions and Escape/closing while a confirmed write is pending", async () => {
        const pending = deferred<any>(); api.save.mockReturnValue(pending.promise);
        render(<ReceptionAttendanceDialog {...props} />); await identify(); choose("attended");
        click(copy.confirm); fireEvent.click(screen.getByRole("button", { name: copy.saving }));
        expect(api.save).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("button", { name: copy.postpone })).toBeDisabled();
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
        expect(props.onClose).not.toHaveBeenCalled();
        await act(async () => { pending.resolve({ data: { appointment: { ...first, attendanceResolution: { outcome: "attended" } }, bookingProof: "proof-next" } }); });
        expect(screen.getByRole("button", { name: copy.postpone })).toBeEnabled();
    });

    it("allows postponing a pending read and discards its reply after unmount", async () => {
        const pending = deferred<any>(); api.history.mockReturnValue(pending.promise);
        const view = render(<ReceptionAttendanceDialog {...props} />);
        click(copy.verifyIdentity); expect(screen.getByText(copy.loading)).toBeVisible();
        click(copy.postpone); expect(props.onClose).toHaveBeenCalledOnce();
        view.unmount();
        await act(async () => { pending.resolve({ data: { appointments: [first], hasMore: false } }); });
        expect(props.onUpdated).not.toHaveBeenCalled(); expect(api.save).not.toHaveBeenCalled();
    });

    it("discards another patient's late query without selecting a new identity automatically", async () => {
        const pending = deferred<any>(); api.history.mockReturnValueOnce(pending.promise);
        const view = render(<ReceptionAttendanceDialog {...props} />); click(copy.verifyIdentity);
        view.rerender(<ReceptionAttendanceDialog {...props} patient={{ ...patient, _id: "other-test", prenom: "Autre", bookingProof: "other-proof" }} />);
        await act(async () => { pending.resolve({ data: { appointments: [first], hasMore: false } }); });
        expect(screen.getByText("Autre Fictif")).toBeVisible();
        expect(screen.queryByRole("heading", { name: /2026-03-08/ })).not.toBeInTheDocument();
        expect(props.onUpdated).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: copy.verifyIdentity })).toBeVisible();
        click(copy.verifyIdentity); await screen.findByRole("heading", { name: /2026-03-08/ });
        expect(api.history).toHaveBeenLastCalledWith({ clinic: "clinic-test", patientId: "other-test", bookingProof: "other-proof" });
    });

    it("does not expose a raw server error or retry a failed write automatically", async () => {
        api.save.mockResolvedValue({ error: { code: "RECEPTION_REPLAN_REQUIRED", message: "RAW PRIVATE ERROR" } });
        render(<ReceptionAttendanceDialog {...props} />); await identify(); choose("notAttended"); click(copy.confirm);
        await screen.findByRole("alert");
        expect(screen.getByRole("alert")).toHaveTextContent(copy.saveError);
        expect(screen.queryByText("RAW PRIVATE ERROR")).not.toBeInTheDocument();
        expect(api.save).toHaveBeenCalledTimes(1); expect(api.history).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("button", { name: copy.confirm })).not.toBeInTheDocument();
        click(copy.refresh); await screen.findByRole("heading", { name: /2026-03-08/ });
        expect(api.history).toHaveBeenCalledTimes(2); expect(api.save).toHaveBeenCalledTimes(1);
    });

    it("requires an explicit new lookup after a proof rejection", async () => {
        api.history.mockResolvedValue({ error: { code: "RECEPTION_LOOKUP_REQUIRED", message: "RAW PRIVATE ERROR" } });
        render(<ReceptionAttendanceDialog {...props} />); click(copy.verifyIdentity);
        await screen.findByText(copy.lookupRequired);
        expect(api.history).toHaveBeenCalledTimes(1); expect(api.save).not.toHaveBeenCalled();
        expect(props.onLookupRequired).not.toHaveBeenCalled();
        click(copy.searchAgain); expect(props.onLookupRequired).toHaveBeenCalledOnce();
    });

    it("does not send any history query when the lookup proof is absent", async () => {
        render(<ReceptionAttendanceDialog {...props} patient={{ ...patient, bookingProof: undefined }} />);
        click(copy.verifyIdentity); await screen.findByText(copy.lookupRequired);
        expect(api.history).not.toHaveBeenCalled(); expect(api.save).not.toHaveBeenCalled();
    });

    it("keeps the unresolved flag when another page exists and refreshes using the new proof", async () => {
        api.history.mockResolvedValueOnce({ data: { appointments: [first], hasMore: true } })
            .mockResolvedValueOnce({ data: { appointments: [second], hasMore: false } });
        render(<ReceptionAttendanceDialog {...props} />); await identify(); choose("attended"); click(copy.confirm);
        await screen.findByText(copy.saved);
        expect(props.onUpdated).toHaveBeenLastCalledWith("patient-test", "proof-next", true);
        expect(screen.queryByText(copy.allResolved)).not.toBeInTheDocument();
        expect(screen.getByText(copy.more)).toBeVisible();
        click(copy.refresh); await screen.findByRole("heading", { name: /2026-03-09/ });
        expect(api.history).toHaveBeenLastCalledWith({ clinic: "clinic-test", patientId: "patient-test", bookingProof: "proof-next" });
    });

    it("closes on Escape before any write and restores focus to the initiating control", () => {
        const trigger = document.createElement("button"); document.body.append(trigger); trigger.focus();
        const view = render(<ReceptionAttendanceDialog {...props} />);
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" }); expect(props.onClose).toHaveBeenCalledOnce();
        view.unmount(); expect(trigger).toHaveFocus(); trigger.remove();
        expect(api.history).not.toHaveBeenCalled(); expect(api.save).not.toHaveBeenCalled();
    });
});
