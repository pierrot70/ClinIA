const COLLECTION = "patients";

const OBSOLETE_INDEX_NAMES = [
    "owner_telephone_search_idx",
    "owner_health_insurance_number_search_idx",
];

export const migration = {
    id: "20260730-drop-out-of-order-patient-search-indexes",
    description:
        "Removes redundant patient search indexes recreated by an out-of-order historical migration.",
    reversible: true,
    transactional: false,
    fingerprint: "drop-out-of-order-patient-search-indexes-v1",

    async up({ db }) {
        const collection = db.collection(COLLECTION);
        const indexes = await collection.indexes();
        const existingIndexNames = new Set(indexes.map((index) => index.name));

        for (const indexName of OBSOLETE_INDEX_NAMES) {
            if (existingIndexNames.has(indexName)) {
                await collection.dropIndex(indexName);
            }
        }
    },
};
