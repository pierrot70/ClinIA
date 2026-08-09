import { beforeEach, describe, expect, it, vi } from "vitest";

const countDocumentsMock = vi.fn();
const findMock = vi.fn();
const findOneAndUpdateMock = vi.fn();
const findByIdMock = vi.fn();
const patientFindMock = vi.fn();
const adminUserFindMock = vi.fn();
const specialistFindMock = vi.fn();
const clinicFindMock = vi.fn();
const getAvailableSlotScheduleMock = vi.fn();

vi.mock("../../models/AppointmentCoordinationRequest.js", () => ({
    AppointmentCoordinationRequest: {
        countDocuments: countDocumentsMock,
        find: findMock,
        findOneAndUpdate: findOneAndUpdateMock,
        findById: findByIdMock,
    },
}));

vi.mock("../../models/Patient.js", () => ({ Patient: { find: patientFindMock } }));
vi.mock("../../models/AdminUser.js", () => ({ AdminUser: { find: adminUserFindMock } }));
vi.mock("../../models/Specialist.js", () => ({ Specialist: { find: specialistFindMock } }));
vi.mock("../../models/Clinique.js", () => ({ Clinique: { find: clinicFindMock } }));
vi.mock("../appointments.js", () => ({ getAvailableSlotSchedule: getAvailableSlotScheduleMock }));
vi.mock("../../db/clinicalWriteConcern.js", () => ({
    CLINICAL_WRITE_CONCERN: { writeConcern: { w: "majority", j: true } },
}));

function resolvedLean(value) {
    return { lean: vi.fn().mockResolvedValue(value) };
}

describe("coordinationRequests service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("anonymizes patients for operational admins", async () => {
        const request = {
            _id: "66c000000000000000000001",
            patient: "66c000000000000000000002",
            requestedByUserId: "66c000000000000000000003",
            specialty: "Cardiologue",
            status: "open",
            createdAt: "2026-08-02T10:00:00.000Z",
            updatedAt: "2026-08-02T10:00:00.000Z",
        };
        const leanMock = vi.fn().mockResolvedValue([request]);
        const limitMock = vi.fn(() => ({ lean: leanMock }));
        const skipMock = vi.fn(() => ({ limit: limitMock }));
        const sortMock = vi.fn(() => ({ skip: skipMock }));
        findMock.mockReturnValue({ sort: sortMock });
        countDocumentsMock.mockResolvedValue(1);
        adminUserFindMock.mockReturnValue(resolvedLean([{ _id: request.requestedByUserId, username: "medecin.1" }]));

        const { listCoordinationRequests } = await import("../coordinationRequests.js");
        const result = await listCoordinationRequests({
            authUser: { role: "ADMIN" },
            page: "1",
            limit: "20",
            status: "open",
        });

        expect(countDocumentsMock).toHaveBeenCalledWith({ status: "open" });
        expect(patientFindMock).not.toHaveBeenCalled();
        expect(result.requests).toEqual([expect.objectContaining({
            id: request._id,
            patient: { anonymized: true },
            requestedBy: { id: request.requestedByUserId, username: "medecin.1" },
        })]);
    });

    it("keeps patient identity available to superadmins", async () => {
        const request = {
            _id: "66c000000000000000000001",
            patient: "66c000000000000000000002",
            requestedByUserId: "66c000000000000000000003",
            specialty: "Cardiologue",
            status: "open",
            createdAt: "2026-08-02T10:00:00.000Z",
            updatedAt: "2026-08-02T10:00:00.000Z",
        };
        const leanMock = vi.fn().mockResolvedValue([request]);
        const limitMock = vi.fn(() => ({ lean: leanMock }));
        const skipMock = vi.fn(() => ({ limit: limitMock }));
        const sortMock = vi.fn(() => ({ skip: skipMock }));
        findMock.mockReturnValue({ sort: sortMock });
        countDocumentsMock.mockResolvedValue(1);
        patientFindMock.mockReturnValue(resolvedLean([
            { _id: request.patient, nom: "Durand", prenom: "Alex" },
        ]));
        adminUserFindMock.mockReturnValue(resolvedLean([
            { _id: request.requestedByUserId, username: "medecin.1" },
        ]));

        const { listCoordinationRequests } = await import("../coordinationRequests.js");
        const result = await listCoordinationRequests({
            authUser: { role: "SUPERADMIN" },
            page: "1",
            limit: "20",
            status: "open",
        });

        expect(patientFindMock).toHaveBeenCalledWith(
            { _id: { $in: [request.patient] } },
            { nom: 1, prenom: 1 }
        );
        expect(result.requests[0].patient).toEqual({
            anonymized: false,
            id: request.patient,
            nom: "Durand",
            prenom: "Alex",
        });
    });

    it("does not allow a physician to list the coordination queue", async () => {
        const { listCoordinationRequests } = await import("../coordinationRequests.js");
        await expect(listCoordinationRequests({ authUser: { role: "MEDECIN" } })).rejects.toMatchObject({
            code: "FORBIDDEN",
        });
        expect(findMock).not.toHaveBeenCalled();
    });

    it("marks an open request ready only after a real future slot is found", async () => {
        const requestId = "66c000000000000000000001";
        const existing = {
            _id: requestId,
            patient: "66c000000000000000000002",
            specialty: "Cardiologue",
            status: "open",
        };
        const updated = { ...existing, status: "ready_to_schedule" };
        findByIdMock.mockReturnValue(resolvedLean(existing));
        specialistFindMock.mockReturnValue(resolvedLean([{
            _id: "66c000000000000000000004",
            clinique_associer: "66c000000000000000000005",
            nom: "Roux",
            prenom: "Camille",
            disponibilites: [new Date("2099-08-03T09:00:00")],
        }]));
        clinicFindMock.mockReturnValue(resolvedLean([{
            _id: "66c000000000000000000005",
            nom: "Clinique Nord",
        }]));
        getAvailableSlotScheduleMock.mockResolvedValue({ slots: ["09:00"] });
        findOneAndUpdateMock.mockReturnValue(resolvedLean(updated));

        const { verifyCoordinationRequestAvailability } = await import("../coordinationRequests.js");
        await expect(verifyCoordinationRequestAvailability({ requestId, authUser: { role: "SUPERADMIN" } })).resolves.toEqual({
            request: updated,
            availability: expect.objectContaining({
                clinique: { id: "66c000000000000000000005", nom: "Clinique Nord" },
                date: "2099-08-03",
                time: "09:00",
            }),
        });
        expect(findOneAndUpdateMock).toHaveBeenCalledWith(
            { _id: requestId, status: "open" },
            expect.objectContaining({
                $set: expect.objectContaining({ status: "ready_to_schedule" }),
            }),
            expect.objectContaining({ new: true, writeConcern: { w: "majority", j: true } })
        );
    });

    it("keeps the request open when every future slot is already unavailable", async () => {
        const requestId = "66c000000000000000000001";
        findByIdMock.mockReturnValue(resolvedLean({
            _id: requestId,
            patient: "66c000000000000000000002",
            specialty: "Cardiologue",
            status: "open",
        }));
        specialistFindMock.mockReturnValue(resolvedLean([{
            _id: "66c000000000000000000004",
            clinique_associer: "66c000000000000000000005",
            disponibilites: [new Date("2099-08-03T09:00:00")],
        }]));
        clinicFindMock.mockReturnValue(resolvedLean([{ _id: "66c000000000000000000005" }]));
        getAvailableSlotScheduleMock.mockResolvedValue({ slots: [] });

        const { verifyCoordinationRequestAvailability } = await import("../coordinationRequests.js");
        await expect(verifyCoordinationRequestAvailability({ requestId, authUser: { role: "ADMIN" } })).rejects.toMatchObject({
            code: "NO_AVAILABLE_SLOTS_FOR_SPECIALTY",
        });
        expect(findOneAndUpdateMock).not.toHaveBeenCalled();
    });
});
