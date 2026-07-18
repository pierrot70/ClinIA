import { describe, expect, it, vi } from "vitest";
import { migration } from "./20260718-add-patient-search-indexes.js";

describe("20260718-add-patient-search-indexes", () => {
    it("backfills normalized keys and replaces the legacy RAMQ unique index", async () => {
        const collection = {
            find: vi.fn(() => ({
                async *[Symbol.asyncIterator]() {
                    yield {
                        _id: "patient-1",
                        nom: "L'Écuyer",
                        prenom: "Élodie",
                        addresse: "10 Rue Test",
                        telephone: "514-555-1212",
                        num_assurance_maladie: "RAMQ-1234",
                    };
                },
            })),
            bulkWrite: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
            createIndex: vi.fn().mockResolvedValue(undefined),
            indexes: vi.fn().mockResolvedValue([
                { name: "_id_" },
                { name: "num_assurance_maladie_1", unique: true },
            ]),
            dropIndex: vi.fn().mockResolvedValue(undefined),
        };
        const db = { collection: vi.fn(() => collection) };

        await migration.up({ db });

        expect(collection.bulkWrite).toHaveBeenCalledWith(
            [
                {
                    updateOne: {
                        filter: { _id: "patient-1" },
                        update: {
                            $set: {
                                nomSearch: "l'ecuyer",
                                prenomSearch: "elodie",
                                addresseSearch: "10 rue test",
                                telephoneSearch: "5145551212",
                                healthInsuranceNumberSearch: "RAMQ1234",
                                country: "CA",
                                healthInsuranceJurisdiction: "QC",
                            },
                        },
                    },
                },
            ],
            { ordered: false }
        );
        expect(collection.createIndex).toHaveBeenCalledTimes(6);
        expect(collection.dropIndex).toHaveBeenCalledWith(
            "num_assurance_maladie_1"
        );
    });
});
