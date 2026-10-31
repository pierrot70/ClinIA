import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchReceptionHistoricalAppointments, regularizeReceptionAttendance } from "./receptionApi";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";

const transport = vi.hoisted(() => ({ authFetch: vi.fn() }));
vi.mock("./authService", () => ({ authFetch: transport.authFetch }));
const scope = { clinic: "clinic-test", patientId: "patient-test", bookingProof: "synthetic-proof" };
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected external request"); })); });
afterEach(() => vi.unstubAllGlobals());
describe("reception attendance API boundaries", () => {
    it("keeps the lookup proof in a same-origin POST body, never in a URL", async () => {
        transport.authFetch.mockResolvedValue({ json: async () => ({ data: { appointments: [], hasMore: false } }) });
        await fetchReceptionHistoricalAppointments(scope);
        const [url, init] = transport.authFetch.mock.calls[0];
        expect(url).toBe("/api/reception/historical-appointments/query");
        expect(url).not.toContain(scope.bookingProof);
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body)).toEqual(scope);
        expect(fetch).not.toHaveBeenCalled();
    });
    it.each(["attended", "not_attended"] as const)("sends an administrative %s outcome and preserves the rotated proof and receipt", async outcome => {
        const result = { data: { appointment: { _id: "old-test", date: "2030-01-01", time: "09:00", attendanceResolution: { outcome } }, bookingProof: "synthetic-fresh-proof" }, meta: { writeVerification: { verificationId: "WRV-TEST", status: "CONFIRMED" } } };
        transport.authFetch.mockResolvedValue({ json: async () => result });
        expect(await regularizeReceptionAttendance("old/test", { ...scope, outcome })).toEqual(result);
        const [url, init] = transport.authFetch.mock.calls[0];
        expect(url).toBe("/api/reception/historical-appointments/old%2Ftest/attendance");
        expect(init.method).toBe("PATCH");
        expect(JSON.parse(init.body)).toEqual({ ...scope, outcome });
        expect(init.body).not.toContain('"status"');
        expect(fetch).not.toHaveBeenCalled();
    });
    it("returns local error labels without retrying a possibly committed write", async () => {
        transport.authFetch.mockRejectedValue(new Error("Private diagnostic must not reach UI"));
        expect(await regularizeReceptionAttendance("old-test", { ...scope, outcome: "attended" })).toMatchObject({ error: { code: "INTERNAL_ERROR", message: UI_LABELS_FR.receptionAttendance.saveError } });
        expect(transport.authFetch).toHaveBeenCalledTimes(1);
        transport.authFetch.mockClear();
        expect(await fetchReceptionHistoricalAppointments(scope)).toMatchObject({ error: { code: "INTERNAL_ERROR", message: UI_LABELS_FR.receptionAttendance.loadError } });
        expect(transport.authFetch).toHaveBeenCalledTimes(1);
    });
});
