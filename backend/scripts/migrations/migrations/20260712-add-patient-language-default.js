// backend/scripts/migrations/migrations/20260712-add-patient-language-default.js
export const migration = {
    id: "20260712-add-patient-language-default",
    description: "Adds French as the default language for existing patients.",
    reversible: false,
    fingerprint: "patients-language-default-fr-v1",

    async up({ db, session }) {
        await db.collection("patients").updateMany(
            { language: { $exists: false } },
            { $set: { language: "fr" } },
            { session }
        );
    },
};