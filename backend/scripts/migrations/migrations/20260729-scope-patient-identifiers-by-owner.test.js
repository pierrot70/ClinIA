import { describe, expect, it, vi } from "vitest";
import { migration } from "./20260729-scope-patient-identifiers-by-owner.js";

describe("20260729-scope-patient-identifiers-by-owner", () => {
    it("replaces global identifier indexes with owner-scoped unique indexes", async () => {
        const collection = {
            updateMany: vi.fn().mockResolvedValue({ modifiedCount: 3 }),
            createIndex: vi.fn().mockResolvedValue(undefined),
            indexes: vi.fn().mockResolvedValue([
                { name: "_id_" },
                { name: "telephone_1", unique: true },
                { name: "owner_telephone_search_idx" },
                { name: "owner_health_insurance_number_search_idx" },
                { name: "health_insurance_number_unique_idx", unique: true },
            ]),
            dropIndex: vi.fn().mockResolvedValue(undefined),
        };
        const db = { collection: vi.fn(() => collection) };

        await migration.up({ db });

        expect(collection.updateMany).toHaveBeenCalledWith(
            { telephoneSearch: "" },
            { $set: { telephoneSearch: null } }
        );
        expect(collection.createIndex).toHaveBeenCalledWith(
            { ownerUserId: 1, telephoneSearch: 1 },
            expect.objectContaining({
                name: "owner_telephone_unique_idx",
                unique: true,
            })
        );
        expect(collection.createIndex).toHaveBeenCalledWith(
            {
                ownerUserId: 1,
                country: 1,
                healthInsuranceJurisdiction: 1,
                healthInsuranceNumberSearch: 1,
            },
            expect.objectContaining({
                name: "owner_health_insurance_number_unique_idx",
                unique: true,
            })
        );
        expect(collection.dropIndex).toHaveBeenCalledWith("telephone_1");
        expect(collection.dropIndex).toHaveBeenCalledWith(
            "health_insurance_number_unique_idx"
        );
    });
});
