import { beforeEach, describe, expect, it, vi } from "vitest";
const services = vi.hoisted(() => Object.fromEntries(["listEligibleCareClinicians", "listPatientCareGrants", "issuePatientCareGrant", "revokePatientCareGrant", "listIncomingCareGrants", "readSharedCareRecord", "listOwnedSharedCareNotes", "appendSharedCareNote"].map(name => [name, vi.fn()])));
vi.mock("../../services/clinicalCareAccess.js", () => services);
import router from "../clinicalCareAccess.js";
const route = (path, method) => router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route;
const response = () => ({ set: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() });
const req = (role = "IPS", body = {}) => ({ params: { id: "507f1f77bcf86cd799439011" }, auth: role ? { userId: "507f1f77bcf86cd799439012", username: "synthetic", role } : undefined, body, headers: {}, requestContext: { instanceId: "synthetic-instance", requestId: "synthetic-request" }, ip: "127.0.0.1" });
async function call(path, method, request) {
    const res = response(); const stack = route(path, method).stack;
    let work;
    stack[0].handle(request, res, () => { work = stack.at(-1).handle(request, res); });
    await work;
    return res;
}
beforeEach(() => { vi.clearAllMocks(); for (const service of Object.values(services)) service.mockResolvedValue([]); });
const endpoints = [
    ["/eligible-clinicians", "get", "IPS", "listEligibleCareClinicians"],
    ["/patients/:id/grants", "get", "IPS", "listPatientCareGrants"],
    ["/patients/:id/grants", "post", "IPS", "issuePatientCareGrant"],
    ["/grants/:id/revoke", "post", "IPS", "revokePatientCareGrant"],
    ["/patients/:id/notes", "get", "IPS", "listOwnedSharedCareNotes"],
    ["/grants", "get", "MEDECIN", "listIncomingCareGrants"],
    ["/grants/:id/record", "get", "MEDECIN", "readSharedCareRecord"],
    ["/grants/:id/notes", "post", "MEDECIN", "appendSharedCareNote"],
];
describe("separate care-sharing router boundaries", () => {
    it.each(endpoints)("protects %s %s with exact role %s", async (path, method, allowedRole, service) => {
        for (const role of [null, "USER", "RECEPTION", "ADMIN", "SUPERADMIN", allowedRole === "IPS" ? "MEDECIN" : "IPS"]) {
            const res = await call(path, method, req(role));
            expect(res.status).toHaveBeenCalledWith(role ? 403 : 401);
            expect(services[service]).not.toHaveBeenCalled();
        }
    });
    it("exposes no note update/delete, patient ownership transfer or generic mutation endpoint", () => {
        expect(router.stack.filter(l => l.route).every(l => !l.route.methods.put && !l.route.methods.patch && !l.route.methods.delete)).toBe(true);
        expect(router.stack.filter(l => l.route).map(l => l.route.path)).not.toContain("/patients/:id");
    });
    it.each([
        ["/patients/:id/grants", { targetUserId: "target", permission: "ADMIN" }],
        ["/patients/:id/grants", { targetUserId: "target", ownerUserId: "another-owner" }],
        ["/grants/:id/revoke", { patientId: "another-patient" }],
        ["/grants/:id/notes", { note: "Synthetic note", authorUserId: "another-author" }],
        ["/grants/:id/notes", { note: "Synthetic note", role: "SUPERADMIN" }],
        ["/grants/:id/notes", []],
        ["/grants/:id/notes", null],
    ])("rejects forged fields on %s", async (path, body) => {
        const res = await call(path, "post", req(path.endsWith("/notes") ? "MEDECIN" : "IPS", body));
        expect(res.status).toHaveBeenCalledWith(400);
        expect(Object.values(services).every(fn => fn.mock.calls.length === 0)).toBe(true);
    });
    it("uses authenticated author identity and a server-generated genuine write verification", async () => {
        services.appendSharedCareNote.mockResolvedValue({ data: { _id: "synthetic-note" }, writeAuditRecorded: true });
        const request = req("MEDECIN", { note: "Synthetic note" });
        const res = await call("/grants/:id/notes", "post", request);
        expect(services.appendSharedCareNote).toHaveBeenCalledWith(request.params.id, "Synthetic note", request.auth,
            expect.objectContaining({ verificationId: expect.stringMatching(/^WRV-/), requestId: "synthetic-request", instanceId: "synthetic-instance" }));
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.set).toHaveBeenCalledWith("Cache-Control", "no-store");
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ meta: expect.objectContaining({ writeVerification: expect.objectContaining({ status: "CONFIRMED", verificationId: expect.stringMatching(/^WRV-/) }) }) }));
    });
    it("never fabricates confirmation when no audit was recorded", async () => {
        services.revokePatientCareGrant.mockResolvedValue({ data: { _id: "synthetic-grant" }, writeAuditRecorded: false });
        const res = await call("/grants/:id/revoke", "post", req());
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ meta: expect.objectContaining({ writeVerification: expect.objectContaining({ status: "UNAVAILABLE", verificationId: null }) }) }));
    });
    it.each([["INVALID_INPUT", 400], ["FORBIDDEN", 403], ["CARE_ACCESS_ALREADY_ACTIVE", 409], ["PRIVATE_ERROR", 500]])("safely returns %s", async (code, status) => {
        services.readSharedCareRecord.mockRejectedValue({ code, message: "PRIVATE_PATIENT_CONTENT", stack: "PRIVATE_STACK" });
        const res = await call("/grants/:id/record", "get", req("MEDECIN"));
        expect(res.status).toHaveBeenCalledWith(status);
        expect(res.set).toHaveBeenCalledWith("Cache-Control", "no-store");
        expect(JSON.stringify(res.json.mock.calls)).not.toContain("PRIVATE");
    });
});
