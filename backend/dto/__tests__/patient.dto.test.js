import { describe, expect, it } from "vitest";
import {
    toArchivePatientDTO,
    toCreatePatientDTO,
    toRestorePatientDTO,
} from "../patient.dto.js";

describe("patient DTO", () => {
    it("accepts a patient without a health insurance number", () => {
        expect(
            toCreatePatientDTO({
                nom: "Lasante",
                prenom: "Pierre",
            })
        ).toMatchObject({
            nom: "Lasante",
            prenom: "Pierre",
            num_assurance_maladie: undefined,
            country: "CA",
            healthInsuranceJurisdiction: "UNKNOWN",
        });
    });

    it("keeps the declared jurisdiction and infers Quebec for legacy RAMQ values", () => {
        expect(
            toCreatePatientDTO({
                nom: "Example",
                prenom: "Ontario",
                num_assurance_maladie: "1234-5678",
                healthInsuranceJurisdiction: "ON",
            }).healthInsuranceJurisdiction
        ).toBe("ON");

        expect(
            toCreatePatientDTO({
                nom: "Example",
                prenom: "Quebec",
                num_assurance_maladie: "RAMQ-1234",
            }).healthInsuranceJurisdiction
        ).toBe("QC");
    });

    it("requires a bounded archive reason", () => {
        expect(() => toArchivePatientDTO({})).toThrow();
        expect(toArchivePatientDTO({ reason: "Doublon confirmé" })).toEqual({
            reason: "Doublon confirmé",
        });
    });

    it("requires a bounded restore reason", () => {
        expect(() => toRestorePatientDTO({})).toThrow();
        expect(toRestorePatientDTO({ reason: "Demande administrative" })).toEqual({
            reason: "Demande administrative",
        });
    });
});
