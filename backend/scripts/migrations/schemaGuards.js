const PATIENT_OWNER_SCOPE_MIGRATION =
    "20260729-scope-patient-identifiers-by-owner";

const EXPECTED_PATIENT_INDEXES = [
    {
        name: "owner_telephone_unique_idx",
        key: { ownerUserId: 1, telephoneSearch: 1 },
        partialField: "telephoneSearch",
    },
    {
        name: "owner_health_insurance_number_unique_idx",
        key: {
            ownerUserId: 1,
            country: 1,
            healthInsuranceJurisdiction: 1,
            healthInsuranceNumberSearch: 1,
        },
        partialField: "healthInsuranceNumberSearch",
    },
];

const PATIENT_IDENTIFIER_INDEX_FIELDS = new Set([
    "telephone",
    "telephoneSearch",
    "num_assurance_maladie",
    "healthInsuranceNumberSearch",
]);

function hasSameKey(index, expectedKey) {
    const actualEntries = Object.entries(index?.key || {});
    const expectedEntries = Object.entries(expectedKey);
    return (
        actualEntries.length === expectedEntries.length &&
        actualEntries.every(
            ([field, direction], position) =>
                field === expectedEntries[position][0] &&
                direction === expectedEntries[position][1]
        )
    );
}

function hasStringPartialFilter(index, field) {
    return index?.partialFilterExpression?.[field]?.$type === "string";
}

export function patientOwnerScopedIndexViolations(indexes) {
    const violations = [];

    for (const index of indexes) {
        const fields = Object.keys(index.key || {});
        const hasPatientIdentifier = fields.some((field) =>
            PATIENT_IDENTIFIER_INDEX_FIELDS.has(field)
        );

        if (
            index.unique === true &&
            hasPatientIdentifier &&
            !fields.includes("ownerUserId")
        ) {
            violations.push(
                `global_unique_patient_identifier_index index=${index.name}`
            );
        }
    }

    for (const expected of EXPECTED_PATIENT_INDEXES) {
        const index = indexes.find((candidate) => candidate.name === expected.name);
        if (!index) {
            violations.push(`missing_required_index index=${expected.name}`);
            continue;
        }

        if (index.unique !== true) {
            violations.push(`required_index_not_unique index=${expected.name}`);
        }
        if (!hasSameKey(index, expected.key)) {
            violations.push(`required_index_wrong_key index=${expected.name}`);
        }
        if (!hasStringPartialFilter(index, expected.partialField)) {
            violations.push(`required_index_wrong_partial_filter index=${expected.name}`);
        }
    }

    return violations;
}

export async function verifyAppliedSchemaGuards({ db, registry }) {
    const scopeMigration = await registry.findOne({
        id: PATIENT_OWNER_SCOPE_MIGRATION,
    });
    if (!scopeMigration) {
        console.log(
            "SCHEMA_GUARD_SKIP guard=patient_owner_scoped_indexes reason=scope_migration_not_applied"
        );
        return;
    }

    const indexes = await db.collection("patients").indexes();
    const violations = patientOwnerScopedIndexViolations(indexes);
    if (violations.length > 0) {
        for (const violation of violations) {
            console.error(
                `ERROR schema_guard_failed guard=patient_owner_scoped_indexes violation=${violation}`
            );
        }
        throw new Error("schema_guard_failed");
    }

    console.log("SCHEMA_GUARD_OK guard=patient_owner_scoped_indexes");
}
