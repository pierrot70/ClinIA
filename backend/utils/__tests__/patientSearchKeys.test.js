import { describe, expect, it } from "vitest";
import {
    buildPatientSearchKeys,
    normalizeHealthInsuranceJurisdiction,
    normalizePatientCountry,
    normalizePatientIdentifierSearch,
    normalizePatientTextSearch,
} from "../patientSearchKeys.js";

describe("patient search keys", () => {
    it("normalizes searchable patient text without accents or case sensitivity", () => {
        expect(normalizePatientTextSearch("  Élodie  L'Écuyer ")).toBe(
            "elodie l'ecuyer"
        );
    });

    it("normalizes identifiers without punctuation", () => {
        expect(normalizePatientIdentifierSearch("+1 (514) 555-1212")).toBe(
            "15145551212"
        );
        expect(normalizePatientIdentifierSearch("ramq-0123 456 789")).toBe(
            "RAMQ0123456789"
        );
    });

    it("builds derived keys from patient identity fields", () => {
        expect(
            buildPatientSearchKeys({
                nom: "Lasante",
                prenom: "Pierre",
                addresse: "2955 Ch Sainte-Marie",
                telephone: "+1 514-555-1212",
                num_assurance_maladie: "RAMQ-0123 456 789",
            })
        ).toEqual({
            nomSearch: "lasante",
            prenomSearch: "pierre",
            addresseSearch: "2955 ch sainte-marie",
            telephoneSearch: "15145551212",
            healthInsuranceNumberSearch: "RAMQ0123456789",
        });
    });

    it("keeps provincial insurance issuers explicit and infers Quebec only for RAMQ legacy values", () => {
        expect(normalizeHealthInsuranceJurisdiction("ON", "1234")).toBe("ON");
        expect(normalizeHealthInsuranceJurisdiction(undefined, "RAMQ-0123")).toBe("QC");
        expect(normalizeHealthInsuranceJurisdiction(undefined, "")).toBe("UNKNOWN");
    });

    it("keeps Canada as the only supported patient country for now", () => {
        expect(normalizePatientCountry("ca")).toBe("CA");
        expect(normalizePatientCountry("US")).toBe("CA");
    });
});
