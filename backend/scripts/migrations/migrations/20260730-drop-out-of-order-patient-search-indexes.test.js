import { describe, expect, it, vi } from "vitest";
import { migration } from "./20260730-drop-out-of-order-patient-search-indexes.js";

describe("20260730-drop-out-of-order-patient-search-indexes", () => {
    it("removes only the two redundant patient search indexes", async () => {
        const collection = {
            indexes: vi.fn().mockResolvedValue([
                { name: "_id_" },
                { name: "owner_telephone_search_idx" },
                { name: "owner_health_insurance_number_search_idx" },
                { name: "owner_telephone_unique_idx" },
            ]),
            dropIndex: vi.fn().mockResolvedValue(undefined),
        };

        await migration.up({ db: { collection: vi.fn(() => collection) } });

        expect(collection.dropIndex).toHaveBeenCalledTimes(2);
        expect(collection.dropIndex).toHaveBeenCalledWith(
            "owner_telephone_search_idx"
        );
        expect(collection.dropIndex).toHaveBeenCalledWith(
            "owner_health_insurance_number_search_idx"
        );
        expect(collection.dropIndex).not.toHaveBeenCalledWith(
            "owner_telephone_unique_idx"
        );
    });

    it("is idempotent when the indexes were already removed", async () => {
        const collection = {
            indexes: vi.fn().mockResolvedValue([{ name: "_id_" }]),
            dropIndex: vi.fn(),
        };

        await migration.up({ db: { collection: vi.fn(() => collection) } });

        expect(collection.dropIndex).not.toHaveBeenCalled();
    });
});
