const COLLECTION = "patients";

const UNIQUE_INDEXES = [
    {
        key: { ownerUserId: 1, telephoneSearch: 1 },
        name: "owner_telephone_unique_idx",
        options: {
            unique: true,
            partialFilterExpression: {
                telephoneSearch: { $type: "string" },
            },
        },
    },
    {
        key: {
            ownerUserId: 1,
            country: 1,
            healthInsuranceJurisdiction: 1,
            healthInsuranceNumberSearch: 1,
        },
        name: "owner_health_insurance_number_unique_idx",
        options: {
            unique: true,
            partialFilterExpression: {
                healthInsuranceNumberSearch: { $type: "string" },
            },
        },
    },
];

const OBSOLETE_INDEX_NAMES = new Set([
    "telephone_1",
    "owner_telephone_search_idx",
    "owner_health_insurance_number_search_idx",
    "health_insurance_number_unique_idx",
]);

export const migration = {
    id: "20260729-scope-patient-identifiers-by-owner",
    description:
        "Scopes patient telephone and health insurance uniqueness to the owning clinician.",
    reversible: false,
    transactional: false,
    fingerprint: "patient-identifier-uniqueness-owner-v1",

    async up({ db }) {
        const collection = db.collection(COLLECTION);

        // Optional phone numbers must not participate in a unique partial index.
        await collection.updateMany(
            { telephoneSearch: "" },
            { $set: { telephoneSearch: null } }
        );

        // Build owner-scoped protections before dropping their global predecessors.
        for (const index of UNIQUE_INDEXES) {
            await collection.createIndex(index.key, {
                name: index.name,
                ...index.options,
            });
        }

        const existingIndexes = await collection.indexes();
        for (const index of existingIndexes) {
            if (OBSOLETE_INDEX_NAMES.has(index.name)) {
                await collection.dropIndex(index.name);
            }
        }
    },
};
