import { describe, expect, it, vi } from "vitest";

import { resolvePreCloudSecurityState } from "../aiAnalyzePreCloudService.js";

describe("aiAnalyzePreCloudService", () => {
    it("blocks the request when sensitive content is detected without acknowledged incident", async () => {
        const detectNonSecureContent = vi.fn(() => ({
            hasMatches: true,
            matches: [{ type: "EMAIL" }],
        }));
        const getAcknowledgedSecurityIncident = vi.fn().mockResolvedValue(null);
        const respondWithSecurityIncident = vi.fn().mockResolvedValue({
            blocked: true,
        });

        const result = await resolvePreCloudSecurityState({
            patient: { medical_history: [], current_medications: [] },
            incidentAckId: null,
            model: "gpt-4.1-mini",
            reqAuth: { userId: "u1", username: "admin", role: "SUPERADMIN" },
            req: { ip: "127.0.0.1", headers: {} },
            fingerprint: "fp-1",
            diagnosis: "Migraine",
            symptoms: ["headache"],
            detectNonSecureContent,
            getAcknowledgedSecurityIncident,
            respondWithSecurityIncident,
            getRequestIp: vi.fn(() => "127.0.0.1"),
            makeSourceHash: vi.fn(() => "hash-123"),
            sanitizeNonSecureContent: vi.fn(),
            res: {},
            forceRealSafe: false,
        });

        expect(result.blocked).toBe(true);
        expect(respondWithSecurityIncident).toHaveBeenCalledTimes(1);
        expect(detectNonSecureContent).toHaveBeenCalledTimes(1);
    });

    it("returns a sanitized patient and neutralization metadata when incident acknowledgment exists", async () => {
        const detectNonSecureContent = vi.fn(() => ({
            hasMatches: true,
            matches: [{ type: "EMAIL" }],
        }));
        const getAcknowledgedSecurityIncident = vi
            .fn()
            .mockResolvedValue({ _id: "incident-123" });
        const sanitizeNonSecureContent = vi.fn(() => ({
            medical_history: ["sanitized"],
            current_medications: [],
        }));

        const result = await resolvePreCloudSecurityState({
            patient: { medical_history: ["raw"], current_medications: [] },
            incidentAckId: "incident-123",
            model: "gpt-4.1-mini",
            reqAuth: null,
            req: { ip: "127.0.0.1", headers: {} },
            fingerprint: "fp-1",
            diagnosis: "Migraine",
            symptoms: ["headache"],
            detectNonSecureContent,
            getAcknowledgedSecurityIncident,
            respondWithSecurityIncident: vi.fn(),
            getRequestIp: vi.fn(() => "127.0.0.1"),
            makeSourceHash: vi.fn(() => "hash-123"),
            sanitizeNonSecureContent,
            res: {},
            forceRealSafe: false,
        });

        expect(result.blocked).toBe(false);
        expect(result.sanitizedPatient).toEqual({
            medical_history: ["sanitized"],
            current_medications: [],
        });
        expect(result.neutralizationMeta).toEqual({
            neutralized: true,
            acknowledgmentIncidentId: "incident-123",
            originalMatches: [{ type: "EMAIL" }],
            message:
                "Requete contenant des donnees sensibles neutralisee apres acknowledgment explicite du clinicien.",
        });
    });
});
