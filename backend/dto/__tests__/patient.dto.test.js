import { describe, expect, it } from "vitest";
import {
    toArchivePatientDTO,
    toCreatePatientDTO,
    toRestorePatientDTO,
    toUpdatePatientDTO,
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

    it.each([
        ["nom", 100],
        ["prenom", 100],
        ["addresse", 255],
        ["telephone", 32],
        ["courriel", 254],
    ])("rejects %s exceeding its maximum length", (field, maximum) => {
        const validValue = field === "telephone"
            ? "+1 514 555 1212"
            : field === "courriel"
                ? `${"a".repeat(242)}@example.com`
                : "a".repeat(maximum);
        const invalidValue = "a".repeat(maximum + 1);
        const valid = {
            nom: "Lasante",
            prenom: "Pierre",
            [field]: validValue,
        };
        const invalid = { ...valid, [field]: invalidValue };

        expect(() => toCreatePatientDTO(valid)).not.toThrow();
        expect(() => toCreatePatientDTO(invalid)).toThrow();
    });

    it("rejects malformed contact details", () => {
        expect(() => toCreatePatientDTO({
            nom: "Lasante",
            prenom: "Pierre",
            courriel: "pas-un-courriel",
        })).toThrow();
        expect(() => toCreatePatientDTO({
            nom: "Lasante",
            prenom: "Pierre",
            telephone: "514-APPEL",
        })).toThrow();
    });

    it("rejects coordinates outside geographical bounds on create and update", () => {
        expect(() => toCreatePatientDTO({
            nom: "Lasante",
            prenom: "Pierre",
            lat: 90.0001,
        })).toThrow();
        expect(() => toCreatePatientDTO({
            nom: "Lasante",
            prenom: "Pierre",
            long: -180.0001,
        })).toThrow();
        expect(() => toUpdatePatientDTO({ lat: "45.5" })).toThrow();
        expect(toCreatePatientDTO({
            nom: "Lasante",
            prenom: "Pierre",
            lat: 90,
            long: -180,
        })).toMatchObject({ lat: 90, long: -180 });
    });

    it("allows coordinates to remain unset or to be cleared", () => {
        expect(toCreatePatientDTO({
            nom: "Lasante",
            prenom: "Pierre",
            lat: null,
            long: null,
        })).toMatchObject({ lat: null, long: null });
        expect(toUpdatePatientDTO({ lat: null, long: null })).toEqual({
            lat: null,
            long: null,
        });
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
