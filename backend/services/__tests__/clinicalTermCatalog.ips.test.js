import { beforeEach, describe, expect, it, vi } from "vitest";
const model = vi.hoisted(() => ({ findOne: vi.fn(), create: vi.fn() }));
vi.mock("../../models/ClinicalTermRequest.js", () => ({ ClinicalTermRequest: model }));
vi.mock("../../utils/requestSafety.js", () => ({ getStaticApprovedClinicalTerms: () => [] }));
import { createClinicalTermRequest } from "../clinicalTermCatalog.js";
beforeEach(() => { vi.clearAllMocks(); model.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }); model.create.mockImplementation(async value => value); });
describe("IPS clinical concept attribution", () => {
    it("keeps the authenticated IPS author and leaves approval to the separate decision workflow", async () => {
        const authUser = { userId: "507f1f77bcf86cd799439011", role: "IPS" };
        await createClinicalTermRequest({ term: "Fatigue", authUser, requestedByUserId: "forged", status: "APPROVED" });
        expect(model.create).toHaveBeenCalledWith({ field: "symptoms", proposedTerm: "Fatigue", normalizedTerm: "fatigue", requestedByUserId: authUser.userId });
    });
    it.each(["", "Patient 123456 RAMQ", "x".repeat(81)])("still rejects invalid concept %# before any persistence", async term => {
        await expect(createClinicalTermRequest({ term, authUser: { userId: "507f1f77bcf86cd799439011", role: "IPS" } })).rejects.toMatchObject({ code: "INVALID_TERM" });
        expect(model.findOne).not.toHaveBeenCalled(); expect(model.create).not.toHaveBeenCalled();
    });
});
