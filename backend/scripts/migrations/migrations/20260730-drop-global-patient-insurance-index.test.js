import { describe, expect, it, vi } from "vitest";
import { migration } from "./20260730-drop-global-patient-insurance-index.js";

describe("20260730-drop-global-patient-insurance-index", () => {
    it("removes the global unique insurance index left by an out-of-order migration", async () => {
        const collection = {
            indexes: vi.fn().mockResolvedValue([
                { name: "_id_" },
                {
                    name: "health_insurance_number_unique_idx",
                    key: {
                        country: 1,
                        healthInsuranceJurisdiction: 1,
                        healthInsuranceNumberSearch: 1,
                    },
                    unique: true,
                },
            ]),
            dropIndex: vi.fn().mockResolvedValue(undefined),
        };

        await migration.up({ db: { collection: vi.fn(() => collection) } });

        expect(collection.dropIndex).toHaveBeenCalledWith(
            "health_insurance_number_unique_idx"
        );
    });

    it("keeps an owner-scoped index even if it uses the legacy name", async () => {
        const collection = {
            indexes: vi.fn().mockResolvedValue([
                {
                    name: "health_insurance_number_unique_idx",
                    key: {
                        ownerUserId: 1,
                        healthInsuranceNumberSearch: 1,
                    },
                    unique: true,
                },
            ]),
            dropIndex: vi.fn(),
        };

        await migration.up({ db: { collection: vi.fn(() => collection) } });

        expect(collection.dropIndex).not.toHaveBeenCalled();
    });
});
