import { describe, expect, it } from "vitest";

import { toSafeCspViolation } from "../cspReports.js";

describe("CSP report normalization", () => {
    it("keeps only a bounded directive and resource category", () => {
        const violation = toSafeCspViolation({
            "effective-directive": "script-src",
            "document-uri": "https://clinique-ai.ca/patients/Jane-Doe?ramq=RAMQ123",
            "blocked-uri": "https://example.invalid/script.js?patient=Jane-Doe",
            "original-policy": "default-src 'self'; report-uri /api/security/csp-reports",
        });

        expect(violation).toEqual({
            type: "CSP_VIOLATION",
            phase: "client_enforcement",
            reason: "La politique de securite du navigateur a bloque une ressource non autorisee.",
            requestPath: "/client",
            transport: "browser_csp",
            matches: [],
            context: {
                directive: "script-src",
                resource: "external",
            },
        });
        expect(JSON.stringify(violation)).not.toContain("Jane-Doe");
        expect(JSON.stringify(violation)).not.toContain("RAMQ123");
    });

    it("drops reports with an unsupported directive", () => {
        expect(
            toSafeCspViolation({
                "effective-directive": "report-uri; Doctor Name",
                "blocked-uri": "https://example.invalid",
            })
        ).toBeNull();
    });
});
