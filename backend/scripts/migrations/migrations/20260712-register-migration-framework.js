export const migration = {
    id: "20260712-register-migration-framework",
    description: "Registers the controlled Mongo migration framework.",
    reversible: true,
    fingerprint: "migration-framework-v1-no-clinical-data-change",
    async up() {
        // The runner records this migration atomically with its registry entry.
    },
};
