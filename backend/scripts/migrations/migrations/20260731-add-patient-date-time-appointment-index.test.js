import { describe, expect, it, vi } from "vitest";
import { migration } from "./20260731-add-patient-date-time-appointment-index.js";

describe("add patient date/time appointment index migration", () => {
    it("creates the partial unique index that closes the concurrent-booking race", async () => {
        const collection = { createIndex: vi.fn().mockResolvedValue(undefined) };
        const db = { collection: vi.fn().mockReturnValue(collection) };

        await migration.up({ db, session: null });

        expect(collection.createIndex).toHaveBeenCalledWith(
            { patient: 1, date: 1, time: 1 },
            {
                name: "patient_date_time_scheduled_unique",
                unique: true,
                partialFilterExpression: { status: "scheduled" },
                session: null,
            }
        );
    });

    it("removes only its own index when rolled back", async () => {
        const collection = { dropIndex: vi.fn().mockResolvedValue(undefined) };
        const db = { collection: vi.fn().mockReturnValue(collection) };

        await migration.down({ db, session: null });

        expect(collection.dropIndex).toHaveBeenCalledWith(
            "patient_date_time_scheduled_unique",
            { session: null }
        );
    });
});
