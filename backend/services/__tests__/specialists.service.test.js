import mongoose from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findById = vi.fn();
const findByIdAndUpdate = vi.fn();

vi.mock("../../models/Specialist.js", () => ({
    Specialist: { findById, findByIdAndUpdate },
}));

vi.mock("../../db/clinicalWriteConcern.js", () => ({
    CLINICAL_QUERY_WRITE_OPTIONS: {},
    CLINICAL_WRITE_CONCERN: {},
}));

const { updateSpecialist } = await import("../specialists.js");

describe("specialists service", () => {
    const specialistId = "507f1f77bcf86cd799439011";
    const clinicA = "507f1f77bcf86cd799439021";
    const clinicB = "507f1f77bcf86cd799439022";
    const oldSlot = new Date("2026-08-03T12:00:00.000Z");
    const futureSlot = new Date("2099-08-10T12:00:00.000Z");

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(mongoose.Types.ObjectId, "isValid").mockReturnValue(true);
        findById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: specialistId,
                clinique_associer: clinicA,
                disponibilites: [oldSlot],
            }),
        });
        findByIdAndUpdate.mockResolvedValue({ _id: specialistId });
    });

    afterEach(() => vi.restoreAllMocks());

    it("preserves an existing past availability when a second clinic is added", async () => {
        await expect(
            updateSpecialist(specialistId, {
                practiceLocations: [
                    { clinique: clinicA, disponibilites: [oldSlot] },
                    { clinique: clinicB, disponibilites: [futureSlot] },
                ],
            })
        ).resolves.toEqual({ _id: specialistId });

        expect(findByIdAndUpdate).toHaveBeenCalledWith(
            specialistId,
            expect.objectContaining({
                $set: expect.objectContaining({
                    clinique_associer: clinicA,
                    disponibilites: [oldSlot],
                }),
            }),
            expect.any(Object)
        );
    });

    it("rejects the same future availability at both clinics", async () => {
        await expect(
            updateSpecialist(specialistId, {
                practiceLocations: [
                    { clinique: clinicA, disponibilites: [futureSlot] },
                    { clinique: clinicB, disponibilites: [futureSlot] },
                ],
            })
        ).rejects.toMatchObject({
            code: "INVALID_INPUT",
            message:
                "Un spécialiste ne peut pas être disponible à deux cliniques au même créneau.",
        });

        expect(findByIdAndUpdate).not.toHaveBeenCalled();
    });
});


describe("retained specialist availability history", () => {
    const specialistId = "507f1f77bcf86cd799439011";
    const clinicA = "507f1f77bcf86cd799439021";
    const clinicB = "507f1f77bcf86cd799439022";
    const regularAugust = "2026-08-23T18:00:00.000Z";
    const walkInSeptember = "2026-09-30T18:00:00.000Z";
    const octoberSlots = ["2026-10-31T18:00:00.000Z", "2026-10-31T18:15:00.000Z"];
    const location = (overrides = {}) => ({
        clinique: clinicA,
        disponibilites: [regularAugust],
        walkInDisponibilites: [walkInSeptember, ...octoberSlots],
        ...overrides,
    });
    const existingLocation = {
        clinique: clinicA, disponibilites: [regularAugust], walkInDisponibilites: [walkInSeptember],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-31T12:00:00.000Z"));
        vi.spyOn(mongoose.Types.ObjectId, "isValid").mockReturnValue(true);
        findById.mockReturnValue({ lean: vi.fn().mockResolvedValue({
            _id: specialistId, practiceLocations: [existingLocation],
        }) });
        findByIdAndUpdate.mockResolvedValue({ _id: specialistId });
    });
    afterEach(() => vi.restoreAllMocks());

    it.each(["practiceLocations", "legacy"])("retains August regular and September walk-in history while adding two October walk-ins (%s storage)", async storage => {
        if (storage === "legacy") {
            findById.mockReturnValue({ lean: vi.fn().mockResolvedValue({
                _id: specialistId, clinique_associer: clinicA,
                disponibilites: [regularAugust], walkInDisponibilites: [walkInSeptember],
            }) });
        }
        const requested = location();
        await expect(updateSpecialist(specialistId, { practiceLocations: [requested] }))
            .resolves.toEqual({ _id: specialistId });
        expect(findByIdAndUpdate).toHaveBeenCalledWith(specialistId, {
            $set: { practiceLocations: [requested], clinique_associer: clinicA,
                disponibilites: [regularAugust], walkInDisponibilites: [walkInSeptember, ...octoberSlots] },
        }, expect.objectContaining({ new: true, runValidators: true }));
    });

    it("keeps unchanged authorized historical walk-ins from several months", async () => {
        const slots = ["2026-08-23T18:15:00.000Z", walkInSeptember];
        findById.mockReturnValue({ lean: vi.fn().mockResolvedValue({
            _id: specialistId, practiceLocations: [{ ...existingLocation, walkInDisponibilites: slots }],
        }) });
        await expect(updateSpecialist(specialistId, {
            practiceLocations: [location({ walkInDisponibilites: slots })],
        })).resolves.toEqual({ _id: specialistId });
    });

    it.each([
        ["a new past walk-in", location({ walkInDisponibilites: [walkInSeptember, "2026-10-30T18:00:00.000Z"] }), "passé"],
        ["new walk-ins in two months", location({ walkInDisponibilites: [walkInSeptember, ...octoberSlots, "2026-11-01T18:00:00.000Z"] }), "même mois"],
        ["duplicate retained history", location({ walkInDisponibilites: [walkInSeptember, walkInSeptember] }), "chevaucher"],
        ["duplicate new walk-ins", location({ walkInDisponibilites: [walkInSeptember, octoberSlots[0], octoberSlots[0]] }), "chevaucher"],
        ["misaligned new walk-in", location({ walkInDisponibilites: [walkInSeptember, "2026-10-31T18:10:00.000Z"] }), "15 minutes"],
        ["invalid date", location({ walkInDisponibilites: [walkInSeptember, "invalid-date"] }), "ISO valide"],
        ["history moved to another clinic", location({ clinique: clinicB, walkInDisponibilites: [] }), "passé"],
        ["regular history moved into walk-ins", location({ disponibilites: [], walkInDisponibilites: [regularAugust] }), "passé"],
        ["walk-in history moved into regular slots", location({ disponibilites: [walkInSeptember], walkInDisponibilites: [] }), "passé"],
    ])("rejects %s before any write", async (_description, requested, message) => {
        await expect(updateSpecialist(specialistId, { practiceLocations: [requested] }))
            .rejects.toMatchObject({ code: "INVALID_INPUT", message: expect.stringContaining(message) });
        expect(findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("still requires retained historical slots to be aligned", async () => {
        const misalignedHistory = "2026-09-30T18:10:00.000Z";
        findById.mockReturnValue({ lean: vi.fn().mockResolvedValue({
            _id: specialistId, practiceLocations: [{ ...existingLocation, walkInDisponibilites: [misalignedHistory] }],
        }) });
        await expect(updateSpecialist(specialistId, {
            practiceLocations: [location({ walkInDisponibilites: [misalignedHistory, ...octoberSlots] })],
        })).rejects.toMatchObject({ code: "INVALID_INPUT", message: expect.stringContaining("15 minutes") });
        expect(findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("continues to reject a future instant duplicated between clinics", async () => {
        await expect(updateSpecialist(specialistId, {
            practiceLocations: [location({ walkInDisponibilites: [octoberSlots[0]] }),
                { clinique: clinicB, disponibilites: [], walkInDisponibilites: [octoberSlots[0]] }],
        })).rejects.toMatchObject({ code: "INVALID_INPUT", message: expect.stringContaining("deux cliniques") });
        expect(findByIdAndUpdate).not.toHaveBeenCalled();
    });
});
