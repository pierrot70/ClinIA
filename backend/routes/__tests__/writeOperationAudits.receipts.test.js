import { beforeEach, describe, expect, it, vi } from "vitest";

const model = vi.hoisted(() => ({ countDocuments: vi.fn(), find: vi.fn() }));
vi.mock("../../models/WriteOperationAuditLog.js", () => ({ WriteOperationAuditLog: model }));
import router from "../writeOperationAudits.js";

const ownHandler = router.stack.find(layer => layer.route?.path === "/my-receipts").route.stack.at(-1).handle;
const adminHandler = router.stack.find(layer => layer.route?.path === "/").route.stack.at(-1).handle;
const actorId = "507f1f77bcf86cd799439031";
function response() { return { status: vi.fn().mockReturnThis(), json: vi.fn() }; }
beforeEach(() => {
    vi.clearAllMocks();
    model.countDocuments.mockResolvedValue(0);
    model.find.mockReturnValue({ sort: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([]) });
});

describe("real receipt route and service with database model mocked", () => {
    it("ignores forged query author/role/outcome and uses only the server-authenticated reception account", async () => {
        const res = response();
        await ownHandler({ auth: { userId: actorId, role: "RECEPTION" }, query: {
            actorUserId: "507f1f77bcf86cd799439032", actorRole: "SUPERADMIN", outcome: "FAILED",
        } }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ logs: [] }) }));
        const expected = { $and: [
            { outcome: "SUCCESS" }, { actorUserId: actorId },
            { verificationId: { $ne: null } },
            { collectionName: { $nin: ["patientauditlogs", "patientclinicalnoteversions"] } },
        ] };
        expect(model.countDocuments).toHaveBeenCalledExactlyOnceWith(expected);
        expect(model.find).toHaveBeenCalledExactlyOnceWith(expected);
    });

    it("does not authorize personal receipts from a query-only claimed user", async () => {
        const res = response();
        await ownHandler({ query: { userId: actorId, role: "RECEPTION" } }, res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(model.find).not.toHaveBeenCalled();
        expect(model.countDocuments).not.toHaveBeenCalled();
    });

    it("keeps the administrative route forbidden to reception", async () => {
        const res = response();
        await adminHandler({ auth: { userId: actorId, role: "RECEPTION" }, query: {} }, res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(model.find).not.toHaveBeenCalled();
        expect(model.countDocuments).not.toHaveBeenCalled();
    });
});


describe("personal receipt UTC route filters", () => {
    it("forwards explicit UTC bounds without forwarding a forged author or role", async () => {
        const res = response();
        await ownHandler({ auth: { userId: actorId, role: "RECEPTION" }, query: {
            startAt: "2026-10-30T23:00:00.000Z", endBefore: "2026-10-31T23:00:00.000Z",
            startDate: "ignored malformed legacy start", endDate: "ignored malformed legacy end",
            actorUserId: "507f1f77bcf86cd799439032", actorRole: "ADMIN", outcome: "FAILED",
        } }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        const query = model.countDocuments.mock.calls[0][0];
        expect(query.$and).toContainEqual({ timestamp: { $gte: new Date("2026-10-30T23:00:00.000Z"), $lt: new Date("2026-10-31T23:00:00.000Z") } });
        expect(query.$and).toContainEqual({ actorUserId: actorId });
        expect(query.$and).not.toContainEqual({ actorRole: "ADMIN" });
        expect(query.$and).toContainEqual({ outcome: "SUCCESS" });
        expect(model.find).toHaveBeenCalledExactlyOnceWith(query);
    });

    it.each([
        { startAt: ["2026-10-31T00:00:00.000Z"] },
        { endBefore: { value: "2026-11-01T00:00:00.000Z" } },
        { startAt: "2026-02-30T00:00:00.000Z" },
        { startAt: "2026-11-02T04:00:00.000Z", endBefore: "2026-11-01T04:00:00.000Z" },
    ])("returns HTTP400 for invalid UTC query bounds before querying records (%j)", async query => {
        const res = response();
        await ownHandler({ auth: { userId: actorId, role: "RECEPTION" }, query }, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: expect.objectContaining({ code: "INVALID_INPUT", retryable: false }) });
        expect(model.find).not.toHaveBeenCalled(); expect(model.countDocuments).not.toHaveBeenCalled();
    });
});
