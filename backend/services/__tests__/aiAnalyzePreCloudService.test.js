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
        expect(respondWithSecurityIncident).toHaveBeenCalledWith(
            expect.objectContaining({
                auditEvent: expect.objectContaining({ payloadHash: "hash-123" }),
                sanitizationPreview: null,
            })
        );
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
        const makeSourceHash = vi.fn(() => "hash-123");

        const result = await resolvePreCloudSecurityState({
            patient: {
                medical_history: ["raw"],
                current_medications: [],
                incidentAckId: "incident-123",
                forceReal: true,
                openaiModel: "gpt-4.1-mini",
                reverifyRequested: true,
            },
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
            makeSourceHash,
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
        expect(getAcknowledgedSecurityIncident).toHaveBeenCalledWith(
            "incident-123",
            "hash-123"
        );
        expect(makeSourceHash).toHaveBeenCalledWith({
            medical_history: ["raw"],
            current_medications: [],
        });
    });

    it("blocks a replay when the acknowledged incident belongs to another payload", async () => {
        const respondWithSecurityIncident = vi.fn().mockResolvedValue({ blocked: true });
        const getAcknowledgedSecurityIncident = vi.fn().mockResolvedValue(null);

        const result = await resolvePreCloudSecurityState({
            patient: { diagnosis: "different raw value" },
            incidentAckId: "incident-123",
            model: "gpt-4.1-mini",
            reqAuth: null,
            req: { ip: "127.0.0.1", headers: {} },
            fingerprint: "fp-1",
            diagnosis: "Migraine",
            symptoms: [],
            detectNonSecureContent: vi.fn(() => ({ hasMatches: true, matches: [{ type: "NAME" }] })),
            getAcknowledgedSecurityIncident,
            respondWithSecurityIncident,
            getRequestIp: vi.fn(() => "127.0.0.1"),
            makeSourceHash: vi.fn(() => "different-payload-hash"),
            sanitizeNonSecureContent: vi.fn(),
            res: {},
            forceRealSafe: false,
        });

        expect(result.blocked).toBe(true);
        expect(getAcknowledgedSecurityIncident).toHaveBeenCalledWith(
            "incident-123",
            "different-payload-hash"
        );
    });

    it("returns a safe correction preview without echoing the original identifier", async () => {
        const respondWithSecurityIncident = vi.fn().mockResolvedValue({ blocked: true });

        await resolvePreCloudSecurityState({
            patient: {
                diagnosis: "Hypertension arterielle",
                symptoms: ["Cephalee", "canary@invalid.test"],
            },
            incidentAckId: null,
            model: "gpt-4.1-mini",
            reqAuth: null,
            req: { ip: "127.0.0.1", headers: {} },
            fingerprint: "fp-1",
            diagnosis: "Hypertension arterielle",
            symptoms: ["Cephalee", "canary@invalid.test"],
            detectNonSecureContent: vi.fn(() => ({ hasMatches: true, matches: [{ type: "email" }] })),
            getAcknowledgedSecurityIncident: vi.fn(),
            respondWithSecurityIncident,
            getRequestIp: vi.fn(() => "127.0.0.1"),
            makeSourceHash: vi.fn(() => "hash-123"),
            sanitizeNonSecureContent: vi.fn(() => ({
                diagnosis: "Hypertension arterielle",
                symptoms: ["Cephalee"],
            })),
            res: {},
            forceRealSafe: false,
        });

        expect(respondWithSecurityIncident).toHaveBeenCalledWith(
            expect.objectContaining({
                sanitizationPreview: { symptoms: ["Cephalee"] },
            })
        );
        expect(JSON.stringify(respondWithSecurityIncident.mock.calls)).not.toContain(
            "canary@invalid.test"
        );
    });
});
