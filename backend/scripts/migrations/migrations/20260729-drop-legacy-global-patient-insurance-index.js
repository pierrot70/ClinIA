const COLLECTION = "patients";
const LEGACY_INDEX_NAME = "num_assurance_maladie_1";

export const migration = {
    id: "20260729-drop-legacy-global-patient-insurance-index",
    description:
        "Removes the legacy global health insurance index that blocks distinct clinician-owned patients with an empty insurance number.",
    reversible: false,
    transactional: false,
    fingerprint: "drop-legacy-global-patient-insurance-index-v1",

    async up({ db }) {
        const collection = db.collection(COLLECTION);
        const indexes = await collection.indexes();
        const legacyIndex = indexes.find(
            (index) =>
                index.name === LEGACY_INDEX_NAME && index.unique === true
        );

        if (legacyIndex) {
            await collection.dropIndex(LEGACY_INDEX_NAME);
        }
    },
};
