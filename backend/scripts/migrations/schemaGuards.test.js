import { describe, expect, it } from "vitest";
import { patientOwnerScopedIndexViolations } from "./schemaGuards.js";

function ownerScopedIndexes() {
    return [
        { name: "_id_", key: { _id: 1 } },
        {
            name: "owner_telephone_unique_idx",
            key: { ownerUserId: 1, telephoneSearch: 1 },
            unique: true,
            partialFilterExpression: {
                telephoneSearch: { $type: "string" },
            },
        },
        {
            name: "owner_health_insurance_number_unique_idx",
            key: {
                ownerUserId: 1,
                country: 1,
                healthInsuranceJurisdiction: 1,
                healthInsuranceNumberSearch: 1,
            },
            unique: true,
            partialFilterExpression: {
                healthInsuranceNumberSearch: { $type: "string" },
            },
        },
    ];
}

describe("patientOwnerScopedIndexViolations", () => {
    it("accepts the expected owner-scoped patient indexes", () => {
        expect(patientOwnerScopedIndexViolations(ownerScopedIndexes())).toEqual([]);
    });

    it("detects the legacy global health insurance index", () => {
        const indexes = [
            ...ownerScopedIndexes(),
            {
                name: "num_assurance_maladie_1",
                key: { num_assurance_maladie: 1 },
                unique: true,
            },
        ];

        expect(patientOwnerScopedIndexViolations(indexes)).toContain(
            "global_unique_patient_identifier_index index=num_assurance_maladie_1"
        );
    });

    it("detects an owner index that loses its partial filter", () => {
        const indexes = ownerScopedIndexes();
        delete indexes[1].partialFilterExpression;

        expect(patientOwnerScopedIndexViolations(indexes)).toContain(
            "required_index_wrong_partial_filter index=owner_telephone_unique_idx"
        );
    });
});
