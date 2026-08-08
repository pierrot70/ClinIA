import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
