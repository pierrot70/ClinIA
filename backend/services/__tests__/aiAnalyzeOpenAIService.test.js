import { describe, expect, it, vi } from "vitest";

import { executeOpenAIAnalyze } from "../aiAnalyzeOpenAIService.js";

function createResponseDouble() {
    return {
        status: vi.fn(),
        json: vi.fn(),
    };
}

describe("aiAnalyzeOpenAIService", () => {
    it("returns a normalized result after auditing a successful OpenAI request", async () => {
        const res = createResponseDouble();
        res.status.mockReturnValue(res);
        const recordOpenAIRequestAuditEvent = vi
            .fn()
            .mockResolvedValue({ _id: "audit-1" });
        const finalizeOpenAIRequestAuditEvent = vi.fn().mockResolvedValue({});
        const recordOpenAISuccess = vi.fn();
        const openai = {
            chat: {
                completions: {
                    create: vi.fn().mockResolvedValue({
                        id: "upstream-1",
                        choices: [
                            {
                                message: {
                                    content: '{"diagnosis":{"suspected":"Migraine"}}',
                                },
                            },
                        ],
                    }),
                },
            },
        };

        const result = await executeOpenAIAnalyze({
            openai,
            model: "gpt-4.1-mini",
            diagnosis: "Migraine",
            patient: { medical_history: [], current_medications: [] },
            symptoms: ["headache"],
            reqAuth: { userId: "u1", username: "admin", role: "SUPERADMIN" },
            req: { ip: "127.0.0.1", headers: {} },
            fingerprint: "fp-1",
            forceRealSafe: false,
            neutralizationMeta: null,
            supportsJsonResponseFormat: vi.fn(() => true),
            recordOpenAIRequestAuditEvent,
            finalizeOpenAIRequestAuditEvent,
            getRequestIp: vi.fn(() => "127.0.0.1"),
            makeSourceHash: vi.fn(() => "hash-123"),
            detectNonSecureContent: vi.fn(() => ({ hasMatches: false })),
            respondWithSecurityIncident: vi.fn(),
            safeParseMedicalAI: vi.fn(() => ({
                diagnosis: { suspected: "Migraine" },
            })),
            normalizeClinicalAnalysis: vi.fn((parsed) => parsed),
            isPlaceholderClinicalAnalysis: vi.fn(() => false),
            recordOpenAISuccess,
            recordOpenAIFailure: vi.fn(),
            res,
            logger: { log: vi.fn(), error: vi.fn() },
        });

        expect(result).toEqual({
            ok: true,
            normalized: { diagnosis: { suspected: "Migraine" } },
        });
        expect(recordOpenAIRequestAuditEvent).toHaveBeenCalledTimes(1);
        expect(finalizeOpenAIRequestAuditEvent).toHaveBeenCalledWith("audit-1", {
            outcome: "SUCCESS",
            upstreamRequestId: "upstream-1",
        });
        expect(recordOpenAISuccess).toHaveBeenCalledTimes(1);
    });

    it("returns a blocking response when post-cloud scanning detects sensitive content", async () => {
        const res = createResponseDouble();
        res.status.mockReturnValue(res);
        const respondWithSecurityIncident = vi.fn().mockResolvedValue({
            blocked: true,
        });

        const result = await executeOpenAIAnalyze({
            openai: {
                chat: {
                    completions: {
                        create: vi.fn().mockResolvedValue({
                            id: "upstream-1",
                            choices: [{ message: { content: "email@example.com" } }],
                        }),
                    },
                },
            },
            model: "gpt-4.1-mini",
            diagnosis: "Migraine",
            patient: { medical_history: [], current_medications: [] },
            symptoms: ["headache"],
            reqAuth: null,
            req: { ip: "127.0.0.1", headers: {} },
            fingerprint: "fp-1",
            forceRealSafe: false,
            neutralizationMeta: null,
            supportsJsonResponseFormat: vi.fn(() => true),
            recordOpenAIRequestAuditEvent: vi.fn().mockResolvedValue({ _id: "audit-1" }),
            finalizeOpenAIRequestAuditEvent: vi.fn().mockResolvedValue({}),
            getRequestIp: vi.fn(() => "127.0.0.1"),
            makeSourceHash: vi.fn(() => "hash-123"),
            detectNonSecureContent: vi.fn(() => ({
                hasMatches: true,
                matches: [{ type: "EMAIL" }],
            })),
            respondWithSecurityIncident,
            safeParseMedicalAI: vi.fn(),
            normalizeClinicalAnalysis: vi.fn(),
            isPlaceholderClinicalAnalysis: vi.fn(),
            recordOpenAISuccess: vi.fn(),
            recordOpenAIFailure: vi.fn(),
            res,
            logger: { log: vi.fn(), error: vi.fn() },
        });

        expect(result.ok).toBe(false);
        expect(respondWithSecurityIncident).toHaveBeenCalledTimes(1);
    });
});
