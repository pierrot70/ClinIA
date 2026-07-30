const COLLECTION = "patients";
const LEGACY_INDEX_NAME = "health_insurance_number_unique_idx";

export const migration = {
    id: "20260730-drop-global-patient-insurance-index",
    description:
        "Removes the legacy global health insurance uniqueness index after out-of-order migration application.",
    reversible: false,
    transactional: false,
    fingerprint: "drop-global-patient-insurance-index-v1",

    async up({ db }) {
        const collection = db.collection(COLLECTION);
        const indexes = await collection.indexes();
        const legacyIndex = indexes.find(
            (index) =>
                index.name === LEGACY_INDEX_NAME &&
                index.unique === true &&
                !Object.hasOwn(index.key || {}, "ownerUserId")
        );

        if (legacyIndex) {
            await collection.dropIndex(LEGACY_INDEX_NAME);
        }
    },
};
