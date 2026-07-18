import { describe, expect, it, vi } from "vitest";

import { migration } from "./20260718-sanitize-audit-request-paths.js";

function createCollection(documents) {
    return {
        find: vi.fn(() => ({
            async *[Symbol.asyncIterator]() {
                yield* documents;
            },
        })),
        bulkWrite: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
}

describe("20260718-sanitize-audit-request-paths", () => {
    it("removes query values and opaque identifiers from historical audit paths", async () => {
        const writeAudits = createCollection([
            {
                _id: "write-audit-1",
                requestPath:
                    "/api/patients/507f1f77bcf86cd799439011?email=patient@example.com",
            },
        ]);
        const patientAudits = createCollection([
            { _id: "patient-audit-1", requestPath: "/api/patients" },
        ]);
        const openAiAudits = createCollection([
            { _id: "openai-audit-1", requestPath: "/api/ai/analyze?forceReal=true" },
        ]);
        const incidents = createCollection([
            {
                _id: "incident-1",
                requestPath:
                    "/api/documents/550e8400-e29b-41d4-a716-446655440000/download",
            },
        ]);
        const collections = new Map([
            ["writeoperationauditlogs", writeAudits],
            ["patientauditlogs", patientAudits],
            ["openairequestauditlogs", openAiAudits],
            ["securityincidents", incidents],
        ]);
        const db = { collection: vi.fn((name) => collections.get(name)) };

        await migration.up({ db, session: "migration-session" });

        expect(writeAudits.bulkWrite).toHaveBeenCalledWith(
            [
                {
                    updateOne: {
                        filter: { _id: "write-audit-1" },
                        update: { $set: { requestPath: "/api/patients/:id" } },
                    },
                },
            ],
            { ordered: false, session: "migration-session" }
        );
        expect(patientAudits.bulkWrite).not.toHaveBeenCalled();
        expect(openAiAudits.bulkWrite).toHaveBeenCalledWith(
            [
                {
                    updateOne: {
                        filter: { _id: "openai-audit-1" },
                        update: { $set: { requestPath: "/api/ai/analyze" } },
                    },
                },
            ],
            { ordered: false, session: "migration-session" }
        );
        expect(incidents.bulkWrite).toHaveBeenCalledWith(
            [
                {
                    updateOne: {
                        filter: { _id: "incident-1" },
                        update: { $set: { requestPath: "/api/documents/:id/download" } },
                    },
                },
            ],
            { ordered: false, session: "migration-session" }
        );
    });
});
