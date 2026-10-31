import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const { create, deleteOne, exists } = vi.hoisted(() => ({ create: vi.fn(), deleteOne: vi.fn(), exists: vi.fn() }));
vi.mock("../../models/ReceptionBookingProof.js", () => ({ ReceptionBookingProof: { create, deleteOne, exists } }));
import { issueReceptionBookingProof, consumeReceptionBookingProof, validateReceptionBookingProof } from "../receptionBookingProof.js";
const context = { authUser: { userId: "user", sessionId: "session" }, clinicId: "clinic", patientId: "patient" };
beforeEach(() => { vi.clearAllMocks(); create.mockResolvedValue([]); deleteOne.mockResolvedValue({ deletedCount: 1 }); exists.mockReturnValue({ session: vi.fn().mockResolvedValue({ _id: "proof-id" }) }); });
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


describe("historical attendance proof lifecycle", () => {
    it("issues a replacement proof in the same transaction without per-operation writeConcern", async () => {
        const session = {};
        await issueReceptionBookingProof({ ...context, session });
        expect(create.mock.calls[0][1]).toEqual({ session });
    });
    it("validates only the hashed, unexpired actor/session/clinic/patient binding without consuming", async () => {
        const session = {};
        await validateReceptionBookingProof({ ...context, bookingProof: "b".repeat(64), session });
        expect(exists).toHaveBeenCalledExactlyOnceWith({ userId: "user", sessionId: "session", clinicId: "clinic", patientId: "patient",
            tokenHash: createHash("sha256").update("b".repeat(64)).digest("hex"), expiresAt: { $gt: expect.any(Date) } });
        expect(exists.mock.results[0].value.session).toHaveBeenCalledExactlyOnceWith(session);
        expect(deleteOne).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
    });
    it.each([undefined, null, "", {}, [], "bad", "f".repeat(65)])("rejects malformed history proof %j before DB access", async bookingProof => {
        await expect(validateReceptionBookingProof({ ...context, bookingProof })).rejects.toMatchObject({ code: "RECEPTION_LOOKUP_REQUIRED" });
        expect(exists).not.toHaveBeenCalled();
    });
    it("rejects an expired, consumed, wrong-session or otherwise unmatched proof", async () => {
        exists.mockReturnValue({ session: vi.fn().mockResolvedValue(null) });
        await expect(validateReceptionBookingProof({ ...context, bookingProof: "a".repeat(64) })).rejects.toMatchObject({ code: "RECEPTION_LOOKUP_REQUIRED" });
    });
});
