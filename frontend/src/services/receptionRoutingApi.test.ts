import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWalkInAvailability, createWalkInBooking } from "./receptionApi";
const transport = vi.hoisted(() => ({ authFetch: vi.fn() }));
vi.mock("./authService", () => ({ authFetch: transport.authFetch }));
beforeEach(() => { vi.clearAllMocks(); transport.authFetch.mockResolvedValue({ json: async () => ({ data: { today: [], future: [] } }) }); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected external request"); })); });
afterEach(() => vi.unstubAllGlobals());
describe("WalkIn routing API boundaries", () => {
    it("keeps an existing patient's proof in a same-origin header and never in the URL", async () => {
        await fetchWalkInAvailability("origin", "synthetic-patient", "synthetic-original", "synthetic-secret-proof");
        const [url, init] = transport.authFetch.mock.calls[0];
        const parsed = new URL(url, "http://clinia.invalid");
        expect(parsed.pathname).toBe("/api/reception/walk-in-options");
        expect(parsed.searchParams.get("clinic")).toBe("origin");
        expect(parsed.searchParams.get("patient")).toBe("synthetic-patient");
        expect(parsed.searchParams.get("replaceAppointmentId")).toBe("synthetic-original");
        expect(url).not.toContain("synthetic-secret-proof");
        expect(init.headers).toEqual({ "X-Reception-Booking-Proof": "synthetic-secret-proof" });
        expect(fetch).not.toHaveBeenCalled();
    });
    it("searches new-patient capacity without sending an identity or a proof", async () => {
        await fetchWalkInAvailability("origin");
        const [url, init] = transport.authFetch.mock.calls[0];
        expect(url).toBe("/api/reception/walk-in-options?clinic=origin");
        expect(init).toBeUndefined();
    });
    it("retains both the destination and authorized origin in the explicit booking body", async () => {
        const payload = { clinic: "nearby", originClinic: "origin", specialist: "ips", date: "2030-01-02", time: "09:00", slotType: "walk_in" as const, patientId: "synthetic-patient", bookingProof: "synthetic-proof" };
        await createWalkInBooking(payload);
        const [url, init] = transport.authFetch.mock.calls[0];
        expect(url).toBe("/api/reception/walk-in-bookings");
        expect(JSON.parse(init.body)).toEqual(payload);
        expect(fetch).not.toHaveBeenCalled();
    });
    it("requests an earlier comparison only explicitly and preserves the proof header", async () => {
        await fetchWalkInAvailability("origin", "synthetic-patient", undefined, "synthetic-proof", true);
        const [url, init]=transport.authFetch.mock.calls[0];
        expect(new URL(url, "http://clinia.invalid").searchParams.get("compareEarlier")).toBe("true");
        expect(init.headers).toEqual({ "X-Reception-Booking-Proof": "synthetic-proof" });
        expect(url).not.toContain("synthetic-proof");
    });

});
