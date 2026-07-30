import { describe, expect, it } from "vitest";
import {
    auditCollectionIndexes,
    hasIndexAuditDrift,
    hasIndexAuditErrors,
} from "./indexAudit.js";

describe("auditCollectionIndexes", () => {
    const expectedIndexes = [
        [
            { ownerUserId: 1, telephoneSearch: 1 },
            {
                unique: true,
                partialFilterExpression: {
                    telephoneSearch: { $type: "string" },
                },
            },
        ],
    ];

    it("accepts an exact expected index and ignores Mongo's _id index", () => {
        const result = auditCollectionIndexes({
            expectedIndexes,
            actualIndexes: [
                { name: "_id_", key: { _id: 1 } },
                {
                    name: "owner_telephone_unique_idx",
                    key: { ownerUserId: 1, telephoneSearch: 1 },
                    unique: true,
                    partialFilterExpression: {
                        telephoneSearch: { $type: "string" },
                    },
                },
            ],
        });

        expect(result).toEqual({ missing: [], mismatched: [], extra: [] });
        expect(hasIndexAuditErrors(result)).toBe(false);
    });

    it("reports a missing expected index", () => {
        const result = auditCollectionIndexes({
            expectedIndexes,
            actualIndexes: [{ name: "_id_", key: { _id: 1 } }],
        });

        expect(result.missing).toHaveLength(1);
        expect(hasIndexAuditErrors(result)).toBe(true);
    });

    it("reports an index with the correct key but unsafe options", () => {
        const result = auditCollectionIndexes({
            expectedIndexes,
            actualIndexes: [
                {
                    name: "owner_telephone_unique_idx",
                    key: { ownerUserId: 1, telephoneSearch: 1 },
                    unique: false,
                },
            ],
        });

        expect(result.mismatched).toHaveLength(1);
        expect(result.extra).toEqual([]);
    });

    it("reports a legacy extra index without treating it as a missing contract", () => {
        const result = auditCollectionIndexes({
            expectedIndexes,
            actualIndexes: [
                {
                    name: "owner_telephone_unique_idx",
                    key: { ownerUserId: 1, telephoneSearch: 1 },
                    unique: true,
                    partialFilterExpression: {
                        telephoneSearch: { $type: "string" },
                    },
                },
                {
                    name: "legacy_global_phone_unique",
                    key: { telephone: 1 },
                    unique: true,
                },
            ],
        });

        expect(result.extra).toHaveLength(1);
        expect(result.extra[0].name).toBe("legacy_global_phone_unique");
        expect(hasIndexAuditErrors(result)).toBe(false);
        expect(hasIndexAuditDrift(result)).toBe(true);
    });
});
