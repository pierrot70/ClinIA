import { beforeEach, describe, expect, it, vi } from "vitest";
const services = vi.hoisted(() => ({ createClinicalTermRequest: vi.fn(), decideClinicalTermRequest: vi.fn(), listApprovedClinicalTerms: vi.fn(), listPendingClinicalTermRequests: vi.fn() }));
vi.mock("../../services/clinicalTermCatalog.js", () => services);
import router from "../clinicalTerms.js";
const actor = "507f1f77bcf86cd799439011";
async function call(path, method, role, body = {}) {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route;
    const req = { auth: role ? { userId: actor, role } : undefined, body, params: { id: "synthetic-request" } };
    let operation;
    route.stack[0].handle(req, res, () => { operation = route.stack.at(-1).handle(req, res); });
    await operation;
    return res;
}
beforeEach(() => {
    vi.clearAllMocks();
    services.listApprovedClinicalTerms.mockResolvedValue([]);
    services.createClinicalTermRequest.mockResolvedValue({ _id: "synthetic-request", status: "PENDING" });
});
describe("IPS clinical term route boundaries", () => {
    it.each(["IPS", "MEDECIN"])("allows %s to read approved terms and request a controlled clinical concept", async role => {
        expect((await call("/approved", "get", role)).status).toHaveBeenCalledWith(200);
        expect((await call("/requests", "post", role, { term: "Fatigue", requestedByUserId: "forged", role: "SUPERADMIN", status: "APPROVED" })).status).toHaveBeenCalledWith(201);
        expect(services.createClinicalTermRequest).toHaveBeenCalledWith({ term: "Fatigue", authUser: { userId: actor, role } });
    });
    it.each([null, "USER", "RECEPTION"])("rejects %s before either clinical term operation", async role => {
        expect((await call("/approved", "get", role)).status).toHaveBeenCalledWith(role ? 403 : 401);
        expect((await call("/requests", "post", role, { term: "Fatigue" })).status).toHaveBeenCalledWith(role ? 403 : 401);
        expect(services.listApprovedClinicalTerms).not.toHaveBeenCalled();
        expect(services.createClinicalTermRequest).not.toHaveBeenCalled();
    });
    it.each(["IPS", "MEDECIN", "RECEPTION", "ADMIN"])("does not give %s pending-list or decision privileges", async role => {
        expect((await call("/requests/pending", "get", role)).status).toHaveBeenCalledWith(403);
        expect((await call("/requests/:id/decision", "post", role, { decision: "APPROVED" })).status).toHaveBeenCalledWith(403);
        expect(services.listPendingClinicalTermRequests).not.toHaveBeenCalled();
        expect(services.decideClinicalTermRequest).not.toHaveBeenCalled();
    });
    it.each(["ADMIN", "SUPERADMIN"])("preserves approved-catalog read for %s without granting request creation", async role => {
        expect((await call("/approved", "get", role)).status).toHaveBeenCalledWith(200);
        expect((await call("/requests", "post", role, { term: "Fatigue" })).status).toHaveBeenCalledWith(403);
        expect(services.createClinicalTermRequest).not.toHaveBeenCalled();
    });
});
