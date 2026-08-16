import { beforeEach, describe, expect, it, vi } from "vitest";

const findMock = vi.fn();
const findOneMock = vi.fn();
const findOneAndUpdateMock = vi.fn();
const createMock = vi.fn();
const patientExistsMock = vi.fn();

vi.mock("../../models/ClinicalSupportAccessRequest.js", () => ({
    ClinicalSupportAccessRequest: {
        find: findMock,
        findOne: findOneMock,
        findOneAndUpdate: findOneAndUpdateMock,
        create: createMock,
    },
}));

vi.mock("../../models/Patient.js", () => ({ Patient: { exists: patientExistsMock } }));

describe("clinicalSupportAccess service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        patientExistsMock.mockResolvedValue({ _id: "66c000000000000000000002" });
    });

    it("allows a new request when an earlier approved access has expired", async () => {
        const patientId = "66c000000000000000000002";
        const physicianUserId = "66c000000000000000000003";
        const lean = vi.fn().mockResolvedValue(null);
        findOneMock.mockReturnValue({ lean });
        createMock.mockResolvedValue({
            _id: "66c000000000000000000004",
            patientId,
            status: "OPEN",
        });

        const { createPhysicianClinicalSupportRequest } = await import("../clinicalSupportAccess.js");
        await expect(createPhysicianClinicalSupportRequest({
            patientId,
            reasonCode: "TECHNICAL_SUPPORT",
            authUser: { userId: physicianUserId, role: "MEDECIN" },
        })).resolves.toMatchObject({ status: "OPEN" });

        expect(findOneMock).toHaveBeenCalledWith(expect.objectContaining({
            patientId,
            physicianUserId,
            $or: [
                { status: { $in: ["OPEN", "PENDING"] } },
                { status: "APPROVED", expiresAt: { $gt: expect.any(Date) } },
            ],
        }));
    });

    it("lists only unexpired approved access for the owning physician", async () => {
        const expiresAt = new Date("2099-08-01T12:00:00.000Z");
        const lean = vi.fn().mockResolvedValue([{
            _id: "66c000000000000000000001",
            patientId: "66c000000000000000000002",
            reasonCode: "TECHNICAL_SUPPORT",
            expiresAt,
        }]);
        const sort = vi.fn(() => ({ lean }));
        findMock.mockReturnValue({ sort });

        const { listActiveClinicalSupportAccessRequests } = await import("../clinicalSupportAccess.js");
        const result = await listActiveClinicalSupportAccessRequests({
            userId: "66c000000000000000000003",
            role: "MEDECIN",
        });

        expect(findMock).toHaveBeenCalledWith(expect.objectContaining({
            physicianUserId: "66c000000000000000000003",
            status: "APPROVED",
            expiresAt: { $gt: expect.any(Date) },
        }));
        expect(sort).toHaveBeenCalledWith({ expiresAt: 1 });
        expect(result).toEqual([expect.objectContaining({
            id: "66c000000000000000000001",
            patientId: "66c000000000000000000002",
            expiresAt,
        })]);
    });

    it("refuses an active-access list for a non-physician", async () => {
        const { listActiveClinicalSupportAccessRequests } = await import("../clinicalSupportAccess.js");
        await expect(listActiveClinicalSupportAccessRequests({ role: "SUPERADMIN" }))
            .rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(findMock).not.toHaveBeenCalled();
    });

    it("lists each dossier with a currently active support workflow for its physician", async () => {
        const lean = vi.fn().mockResolvedValue([{
            patientId: "66c000000000000000000002",
            status: "OPEN",
        }]);
        findMock.mockReturnValue({ lean });

        const { listPhysicianClinicalSupportRequestStatuses } = await import("../clinicalSupportAccess.js");
        await expect(listPhysicianClinicalSupportRequestStatuses({
            userId: "66c000000000000000000003",
            role: "MEDECIN",
        })).resolves.toEqual([{
            patientId: "66c000000000000000000002",
            status: "OPEN",
        }]);

        expect(findMock).toHaveBeenCalledWith(expect.objectContaining({
            physicianUserId: "66c000000000000000000003",
            $or: [
                { status: { $in: ["OPEN", "PENDING"] } },
                { status: "APPROVED", expiresAt: { $gt: expect.any(Date) } },
            ],
        }));
    });

    it("lists only active access requested by the current superadmin", async () => {
        const lean = vi.fn().mockResolvedValue([]);
        const sort = vi.fn(() => ({ lean }));
        findMock.mockReturnValue({ sort });

        const { listOwnActiveClinicalSupportAccessRequests } = await import("../clinicalSupportAccess.js");
        await listOwnActiveClinicalSupportAccessRequests({ userId: "66c000000000000000000004", role: "SUPERADMIN" });

        expect(findMock).toHaveBeenCalledWith(expect.objectContaining({
            requestedByUserId: "66c000000000000000000004",
            status: "APPROVED",
            expiresAt: { $gt: expect.any(Date) },
        }));
    });

    it("atomically assigns an open support request to one superadmin", async () => {
        const requestId = "66c000000000000000000005";
        findOneAndUpdateMock.mockResolvedValue({ _id: requestId, status: "PENDING" });
        const { claimClinicalSupportRequest } = await import("../clinicalSupportAccess.js");
        await expect(claimClinicalSupportRequest({
            requestId,
            justificationCode: "SECURITY_INCIDENT",
            authUser: { userId: "66c000000000000000000006", role: "SUPERADMIN" },
        })).resolves.toMatchObject({ status: "PENDING" });
        expect(findOneAndUpdateMock).toHaveBeenCalledWith(
            { _id: requestId, status: "OPEN", requestedByUserId: null },
            { $set: { requestedByUserId: "66c000000000000000000006", superadminJustificationCode: "SECURITY_INCIDENT", status: "PENDING" } },
            { new: true }
        );
    });

    it("requires a structured superadmin justification before a claim", async () => {
        const { claimClinicalSupportRequest } = await import("../clinicalSupportAccess.js");
        await expect(claimClinicalSupportRequest({
            requestId: "66c000000000000000000005",
            authUser: { userId: "66c000000000000000000006", role: "SUPERADMIN" },
        })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(findOneAndUpdateMock).not.toHaveBeenCalled();
    });
});
