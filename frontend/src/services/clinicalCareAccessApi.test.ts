import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPatientCareGrant, appendSharedCareNote, readSharedCareRecord, revokePatientCareGrant, listPatientCareGrants, listReceivedCareGrants } from "./clinicalCareAccessApi";
const transport = vi.hoisted(() => ({ authFetch: vi.fn() }));
vi.mock("./authService", () => ({ authFetch: transport.authFetch }));
beforeEach(() => { vi.clearAllMocks(); transport.authFetch.mockResolvedValue({ json: async () => ({ data: {}, meta: {} }) }); vi.stubGlobal("fetch", vi.fn(() => { throw Error("External request forbidden"); })); });
afterEach(() => vi.unstubAllGlobals());
describe("dedicated clinical care API boundaries", () => {
    it("posts only the recipient and allowed duration to the scoped patient grant endpoint", async () => {
        await createPatientCareGrant("synthetic/patient", "target", 60);
        const [url, init] = transport.authFetch.mock.calls[0];
        expect(url).toBe("/api/clinical-care-access/patients/synthetic%2Fpatient/grants");
        expect(init.method).toBe("POST"); expect(JSON.parse(init.body)).toEqual({ targetUserId: "target", durationMinutes: 60 });
        expect(init.body).not.toContain("ownerUserId"); expect(init.body).not.toContain("permissions"); expect(fetch).not.toHaveBeenCalled();
    });
    it("sends note text only in the same-origin append endpoint body, without patient ownership or old notes", async () => {
        await appendSharedCareNote("synthetic-grant", "SYNTHETIC clinical note");
        const [url, init] = transport.authFetch.mock.calls[0];
        expect(url).toBe("/api/clinical-care-access/grants/synthetic-grant/notes");
        expect(url).not.toContain("SYNTHETIC clinical note");
        expect(JSON.parse(init.body)).toEqual({ note: "SYNTHETIC clinical note" }); expect(fetch).not.toHaveBeenCalled();
    });
    it("uses the dedicated no-store record read and owner revoke endpoints", async () => {
        await readSharedCareRecord("grant/id"); await revokePatientCareGrant("grant/id");
        expect(transport.authFetch.mock.calls[0]).toEqual(["/api/clinical-care-access/grants/grant%2Fid/record", { cache: "no-store" }]);
        expect(transport.authFetch.mock.calls[1][0]).toBe("/api/clinical-care-access/grants/grant%2Fid/revoke");
        expect(JSON.parse(transport.authFetch.mock.calls[1][1].body)).toEqual({});
    });
    it("does not retry a failed write and keeps raw diagnostics out of the UI error", async () => {
        transport.authFetch.mockRejectedValue(Error("Private diagnostic"));
        expect(await appendSharedCareNote("grant", "Fiction")).toMatchObject({ error: { code: "INTERNAL_ERROR" } });
        expect(transport.authFetch).toHaveBeenCalledTimes(1);
    });
    it("keeps owner management and receiving clinician lists on separate scoped endpoints", async () => {
        await listPatientCareGrants("patient"); await listReceivedCareGrants();
        expect(transport.authFetch.mock.calls.map(row => row[0])).toEqual(["/api/clinical-care-access/patients/patient/grants", "/api/clinical-care-access/grants"]);
    });
});
