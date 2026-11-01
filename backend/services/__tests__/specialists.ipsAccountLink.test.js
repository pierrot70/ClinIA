import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findAccount: vi.fn(), findById: vi.fn(), update: vi.fn(), save: vi.fn() }));
vi.mock("../../models/AdminUser.js", () => ({ AdminUser: { findOne: mocks.findAccount } }));
vi.mock("../../models/Specialist.js", () => {
    class Specialist { constructor(value) { this.value = value; } save(options) { return mocks.save(this.value, options); } }
    Specialist.findById = mocks.findById; Specialist.findByIdAndUpdate = mocks.update;
    return { Specialist };
});
import { createSpecialist, updateSpecialist } from "../specialists.js";
const specialistId = "507f1f77bcf86cd799439011", accountId = "507f1f77bcf86cd799439012", otherId = "507f1f77bcf86cd799439013";
const dto = specialty => ({ nom: "Synthetic", prenom: "Professional", numero_medecin: "SYNTHETIC_TEST_ONLY", specialite: specialty, accountUserId: accountId });
let account, existing;
beforeEach(() => {
    vi.clearAllMocks();
    account = { _id: accountId, role: "IPS", isActive: true };
    existing = { _id: specialistId, specialite: "IPS", accountUserId: accountId };
    mocks.findAccount.mockImplementation(filter => ({ lean: vi.fn().mockResolvedValue(filter._id === account._id && filter.role === account.role && filter.isActive === account.isActive ? account : null) }));
    mocks.findById.mockImplementation(() => ({ lean: vi.fn().mockResolvedValue(existing) }));
    mocks.save.mockResolvedValue({ _id: specialistId }); mocks.update.mockResolvedValue({ _id: specialistId });
});
describe("professional specialty and active account role must match", () => {
    it.each([["IPS", "IPS"], ["Urgentologue", "MEDECIN"], ["Medecin de famille", "MEDECIN"]])("accepts %s only with its active %s account", async (specialty, role) => {
        account.role = role;
        await expect(createSpecialist(dto(specialty))).resolves.toEqual({ _id: specialistId });
        expect(mocks.findAccount).toHaveBeenCalledWith({ _id: accountId, role, isActive: true });
        expect(mocks.save).toHaveBeenCalledOnce();
    });
    it.each([["IPS", "MEDECIN"], ["Urgentologue", "IPS"], ["Medecin de famille", "IPS"], ["IPS", "RECEPTION"], ["IPS", "ADMIN"], ["IPS", "SUPERADMIN"]])("rejects %s linked to role %s without saving", async (specialty, role) => {
        account.role = role;
        await expect(createSpecialist(dto(specialty))).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(mocks.save).not.toHaveBeenCalled();
    });
    it("rejects an inactive IPS account", async () => {
        account.isActive = false;
        await expect(createSpecialist(dto("IPS"))).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(mocks.save).not.toHaveBeenCalled();
    });
    it.each([["IPS", "Medecin de famille", "IPS"], ["Medecin de famille", "IPS", "MEDECIN"]])("rejects changing %s to %s while retaining an incompatible %s account", async (oldSpecialty, newSpecialty, role) => {
        existing.specialite = oldSpecialty; account.role = role;
        await expect(updateSpecialist(specialistId, { specialite: newSpecialty })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(mocks.findAccount).toHaveBeenCalledWith({ _id: accountId, role: newSpecialty === "IPS" ? "IPS" : "MEDECIN", isActive: true });
        expect(mocks.update).not.toHaveBeenCalled();
    });
    it("allows changing specialty and account together when both match the new profession", async () => {
        account = { _id: otherId, role: "MEDECIN", isActive: true };
        await expect(updateSpecialist(specialistId, { specialite: "Urgentologue", accountUserId: otherId })).resolves.toEqual({ _id: specialistId });
        expect(mocks.update).toHaveBeenCalledWith(specialistId, { $set: { specialite: "Urgentologue", accountUserId: otherId } }, expect.objectContaining({ new: true, runValidators: true }));
    });
    it("checks the retained IPS specialty when replacing only the linked account", async () => {
        account = { _id: otherId, role: "MEDECIN", isActive: true };
        await expect(updateSpecialist(specialistId, { accountUserId: otherId })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(mocks.update).not.toHaveBeenCalled();
        account.role = "IPS";
        await expect(updateSpecialist(specialistId, { accountUserId: otherId })).resolves.toEqual({ _id: specialistId });
        expect(mocks.findAccount).toHaveBeenLastCalledWith({ _id: otherId, role: "IPS", isActive: true });
    });
    it("permits explicitly unlinking the old account while changing specialty", async () => {
        await expect(updateSpecialist(specialistId, { specialite: "Medecin de famille", accountUserId: null })).resolves.toEqual({ _id: specialistId });
        expect(mocks.findAccount).not.toHaveBeenCalled();
        expect(mocks.update).toHaveBeenCalledWith(specialistId, { $set: { specialite: "Medecin de famille" }, $unset: { accountUserId: 1 } }, expect.any(Object));
    });
});
