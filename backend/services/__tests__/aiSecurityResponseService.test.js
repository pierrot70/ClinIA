import { describe, expect, it, vi } from "vitest";

import { createRespondWithSecurityIncident } from "../aiSecurityResponseService.js";

function createResponseDouble() {
    return {
        status: vi.fn(),
        json: vi.fn(),
    };
}

describe("aiSecurityResponseService", () => {
    it("records a pre-cloud audit failure and returns a blocking 422 response", async () => {
        const createSecurityIncident = vi.fn().mockResolvedValue({ _id: "incident-123" });
        const recordOpenAIRequestAuditEvent = vi.fn().mockResolvedValue({});
        const buildBlockingIncidentResponse = vi.fn().mockReturnValue({
            error: { code: "BLOCKED" },
        });
        const makeSourceHash = vi.fn().mockReturnValue("hash-123");
        const logger = { error: vi.fn() };
        const res = createResponseDouble();
        res.status.mockReturnValue(res);

        const respondWithSecurityIncident = createRespondWithSecurityIncident({
            createSecurityIncident,
            recordOpenAIRequestAuditEvent,
            buildBlockingIncidentResponse,
            makeSourceHash,
            logger,
        });

        await respondWithSecurityIncident({
            res,
            phase: "pre_cloud",
            reason: "Sensitive identifier detected",
            requestPath: "/api/ai/analyze",
            matches: [{ type: "EMAIL" }, { type: "EMAIL" }, { type: "PHONE" }],
            context: { model: "gpt-4.1-mini" },
            auditEvent: {
                actorUserId: "u1",
                actorUsername: "admin",
                actorRole: "SUPERADMIN",
                ip: "127.0.0.1",
                model: "gpt-4.1-mini",
                payloadSizeBytes: 42,
                requestContext: { fingerprint: "fp-1" },
            },
        });

        expect(createSecurityIncident).toHaveBeenCalledWith({
            phase: "pre_cloud",
            reason: "Sensitive identifier detected",
            requestPath: "/api/ai/analyze",
            matches: [{ type: "EMAIL" }, { type: "EMAIL" }, { type: "PHONE" }],
            context: { model: "gpt-4.1-mini" },
            transport: "openai_chat_completions",
        });
        expect(recordOpenAIRequestAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "AI_ANALYZE_REQUEST",
                outcome: "FAILED",
                errorCode: "PRE_CLOUD_IDENTIFIER_DETECTED",
                acknowledgmentIncidentId: "incident-123",
                neutralized: false,
                requestContext: expect.objectContaining({
                    fingerprint: "fp-1",
                    securityIncidentPhase: "pre_cloud",
                    blockedBeforeCloud: true,
                    detectedIdentifierCount: 3,
                    detectedIdentifierTypes: ["EMAIL", "PHONE"],
                }),
            })
        );
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalledWith({ error: { code: "BLOCKED" } });
        expect(logger.error).not.toHaveBeenCalled();
    });

    it("returns a 500 workflow-blocking response when incident persistence fails", async () => {
        const createSecurityIncident = vi.fn().mockRejectedValue(new Error("mongo down"));
        const recordOpenAIRequestAuditEvent = vi.fn();
        const buildBlockingIncidentResponse = vi.fn();
        const makeSourceHash = vi.fn();
        const logger = { error: vi.fn() };
        const res = createResponseDouble();
        res.status.mockReturnValue(res);

        const respondWithSecurityIncident = createRespondWithSecurityIncident({
            createSecurityIncident,
            recordOpenAIRequestAuditEvent,
            buildBlockingIncidentResponse,
            makeSourceHash,
            logger,
        });

        await respondWithSecurityIncident({
            res,
            phase: "post_cloud",
            reason: "Sensitive content detected after model response",
            requestPath: "/api/ai/analyze",
            matches: [{ type: "EMAIL" }],
        });

        expect(recordOpenAIRequestAuditEvent).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "SECURITY_INCIDENT_LOG_FAILED",
                message:
                    "Contenu non securise detecte mais incident non enregistre. Workflow bloque: reessayez ou contactez l'administrateur.",
                retryable: true,
            },
            blocking: {
                required: true,
                userMessage:
                    "L'incident de securite doit etre journalise avant de continuer.",
            },
        });
        expect(logger.error).toHaveBeenCalledTimes(1);
    });
});
