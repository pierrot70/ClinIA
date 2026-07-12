export const migration = {
    id: "20260712-expand-patient-language-options",
    description:
        "Records the compatible patient language options without changing existing data.",
    reversible: true,
    fingerprint: "patients-language-options-supported-locales-v2",
    async up() {
        // The application schema now accepts the additional option; no data rewrite is required.
    },
    async down() {
        // No data was transformed by this registry-only migration.
    },
};
