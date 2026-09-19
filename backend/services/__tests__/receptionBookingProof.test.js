import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const { create, deleteOne } = vi.hoisted(() => ({ create: vi.fn(), deleteOne: vi.fn() }));
vi.mock("../../models/ReceptionBookingProof.js", () => ({ ReceptionBookingProof: { create, deleteOne } }));
import { issueReceptionBookingProof, consumeReceptionBookingProof } from "../receptionBookingProof.js";
const context = { authUser: { userId: "user", sessionId: "session" }, clinicId: "clinic", patientId: "patient" };
beforeEach(() => { vi.clearAllMocks(); create.mockResolvedValue([]); deleteOne.mockResolvedValue({ deletedCount: 1 }); });
describe("reception proof", () => {
    it("issues unpredictable proofs and persists only their hash with bounded expiry and scope", async () => {
        const start = Date.now();
        const token = await issueReceptionBookingProof(context);
        const second = await issueReceptionBookingProof(context);
        expect(token).toMatch(/^[a-f0-9]{64}$/);
        expect(token).not.toBe(second);
        const [record] = create.mock.calls[0][0];
        expect(record).toMatchObject({ tokenHash: createHash("sha256").update(token).digest("hex"), userId: "user", sessionId: "session", clinicId: "clinic", patientId: "patient" });
        expect(record.expiresAt.getTime()).toBeGreaterThanOrEqual(start + 600000);
        expect(record.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 600000);
        expect(JSON.stringify(record)).not.toContain(token);
    });
    it("fails closed without an authenticated session", async () => {
        await expect(issueReceptionBookingProof({ ...context, authUser: { userId: "user" } })).rejects.toMatchObject({ code: "RECEPTION_LOOKUP_REQUIRED" });
        expect(create).not.toHaveBeenCalled();
    });
    it.each([undefined, null, "", "forged", {}, "a".repeat(65)])("rejects malformed proof %j before querying", async bookingProof => {
        await expect(consumeReceptionBookingProof({ ...context, bookingProof, session: {} })).rejects.toMatchObject({ code: "RECEPTION_LOOKUP_REQUIRED" });
        expect(deleteOne).not.toHaveBeenCalled();
    });
    it("consumes only the bound unexpired proof in the booking transaction", async () => {
        const session = {};
        await consumeReceptionBookingProof({ ...context, bookingProof: "a".repeat(64), session });
        expect(deleteOne).toHaveBeenCalledWith({ userId: "user", sessionId: "session", clinicId: "clinic", patientId: "patient", tokenHash: expect.any(String), expiresAt: { $gt: expect.any(Date) } }, { session });
        deleteOne.mockResolvedValue({ deletedCount: 0 });
        await expect(consumeReceptionBookingProof({ ...context, bookingProof: "a".repeat(64), session })).rejects.toMatchObject({ code: "RECEPTION_LOOKUP_REQUIRED" });
    });
});
