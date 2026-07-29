import { describe, expect, it, vi } from "vitest";
import { migration } from "./20260729-drop-legacy-global-patient-insurance-index.js";

describe("20260729-drop-legacy-global-patient-insurance-index", () => {
    it("removes the legacy global insurance index when it remains present", async () => {
        const collection = {
            indexes: vi.fn().mockResolvedValue([
                { name: "_id_" },
                { name: "num_assurance_maladie_1", unique: true },
            ]),
            dropIndex: vi.fn().mockResolvedValue(undefined),
        };

        await migration.up({ db: { collection: vi.fn(() => collection) } });

        expect(collection.dropIndex).toHaveBeenCalledWith(
            "num_assurance_maladie_1"
        );
    });

    it("does nothing when the legacy index is absent", async () => {
        const collection = {
            indexes: vi.fn().mockResolvedValue([{ name: "_id_" }]),
            dropIndex: vi.fn(),
        };

        await migration.up({ db: { collection: vi.fn(() => collection) } });

        expect(collection.dropIndex).not.toHaveBeenCalled();
    });
});
