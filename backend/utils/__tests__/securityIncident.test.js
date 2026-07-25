import { describe, expect, it } from "vitest";
import {
    buildBlockingIncidentResponse,
    detectNonSecureContent,
    sanitizeNonSecureContent,
} from "../securityIncident.js";

describe("security incident detection", () => {
    it("detects patient identifiers in object payload", () => {
        const payload = {
            nom: "Jean Dupont",
            prenom: "Marie",
            num_assurance_maladie: "RAMQ1234567890",
            telephone: "514-555-1212",
            courriel: "patient@example.com",
            addresse: "123 Rue Principale",
            dob: "1987-01-29",
        };

        const result = detectNonSecureContent(payload);

        expect(result.hasMatches).toBe(true);
        expect(result.matches.some((m) => m.type === "name")).toBe(true);
        expect(result.matches.some((m) => m.type === "ramq")).toBe(true);
        expect(result.matches.some((m) => m.type === "phone")).toBe(true);
        expect(result.matches.some((m) => m.type === "email")).toBe(true);
        expect(result.matches.some((m) => m.type === "address")).toBe(true);
        expect(result.matches.some((m) => m.type === "dob")).toBe(true);
    });

    it("returns no matches for safe payload", () => {
        const payload = {
            symptoms: ["toux", "fatigue"],
            notes: "analyze guideline only",
        };

        const result = detectNonSecureContent(payload);
        expect(result.hasMatches).toBe(false);
        expect(result.matches).toEqual([]);
    });

    it("builds blocking contract requiring explicit acknowledgment", () => {
        const response = buildBlockingIncidentResponse({
            _id: "507f1f77bcf86cd799439011",
            type: "NON_SECURE_CONTENT",
            phase: "pre_cloud",
            reason: "Patient identifier detected",
            detectedAt: "2026-03-09T10:00:00.000Z",
            context: { requestPath: "/api/ai/analyze" },
            matches: [{ type: "email", path: "payload.courriel", sample: "pa***om" }],
        });

        expect(response.error.code).toBe("SECURITY_INCIDENT_BLOCKING");
        expect(response.blocking.required).toBe(true);
        expect(response.blocking.acknowledgment.requiredAction).toBe("J'ai lu et compris");
        expect(response.blocking.acknowledgment.endpoint).toBe(
            "/api/security/incidents/acknowledge"
        );
        expect(response.blocking.incident.id).toBe("507f1f77bcf86cd799439011");
    });

    it("includes only a safe correction preview when one is supplied", () => {
        const response = buildBlockingIncidentResponse(
            { _id: "507f1f77bcf86cd799439011" },
            { sanitizationPreview: { symptoms: ["Cephalee"] } }
        );

        expect(response.blocking.incident.sanitizationPreview).toEqual({
            symptoms: ["Cephalee"],
        });
    });

    it("removes identifier-bearing list items while keeping approved clinical entries", () => {
        const sanitized = sanitizeNonSecureContent({
            patient_name: "Canary Patient",
            symptoms: ["Cephalee", "canary@invalid.test"],
            medical_history: ["Dyslipidemie"],
        });

        expect(sanitized).toEqual({
            patient_name: "[REDACTED_NAME]",
            symptoms: ["Cephalee"],
            medical_history: ["Dyslipidemie"],
        });
    });
});
