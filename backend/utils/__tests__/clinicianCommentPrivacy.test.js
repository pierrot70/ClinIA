import { describe, expect, it } from "vitest";
import {
    detectDirectContactInfo,
    obfuscateClinicianComment,
} from "../clinicianCommentPrivacy.js";

describe("obfuscateClinicianComment", () => {
    it("obfuscates direct identifiers and labeled values", () => {
        const result = obfuscateClinicianComment(
            "Nom: Jean Tremblay\nEmail: pierre@example.com\nTelephone: 514-555-1234\nRAMQ: TREJ12345678\nVille: Montreal"
        );

        expect(result.sanitized).toContain("Nom: [VALEUR_OBFUSQUEE]");
        expect(result.sanitized).toContain("Email: [VALEUR_OBFUSQUEE]");
        expect(result.sanitized).toContain("Telephone: [VALEUR_OBFUSQUEE]");
        expect(result.sanitized).toContain("RAMQ: [VALEUR_OBFUSQUEE]");
        expect(result.sanitized).toContain("Ville: [VALEUR_OBFUSQUEE]");
        expect(result.redactionCount).toBeGreaterThan(0);
    });

    it("obfuscates free-form emails and phones", () => {
        const result = obfuscateClinicianComment(
            "Joignez-moi au 418 555 0101 ou a doc@test.ca."
        );

        expect(result.sanitized).toContain("[TELEPHONE_OBFUSQUE]");
        expect(result.sanitized).toContain("[EMAIL_OBFUSQUE]");
        expect(result.redactionTypes).toContain("PHONE");
        expect(result.redactionTypes).toContain("EMAIL");
    });

    it("obfuscates free-form person names", () => {
        const result = obfuscateClinicianComment(
            "Disons bonjour a Pierre Lasante"
        );

        expect(result.sanitized).toContain("Disons bonjour a P***e L***e");
        expect(result.redactionTypes).toContain("PERSON_NAME");
    });

    it("detects direct contact channels in admin replies", () => {
        expect(
            detectDirectContactInfo(
                "Ecrivez-moi a pierre@example.com ou appelez au 514-555-1234."
            )
        ).toEqual(["EMAIL", "PHONE"]);

        expect(
            detectDirectContactInfo(
                "Vous pouvez aussi consulter https://clinique-ai.ca/support"
            )
        ).toEqual(["URL"]);
    });
});
