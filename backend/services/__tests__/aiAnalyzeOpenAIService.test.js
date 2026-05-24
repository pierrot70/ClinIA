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

    it("adds type 2 diabetes comparison guardrails to the OpenAI prompt", async () => {
        const res = createResponseDouble();
        res.status.mockReturnValue(res);
        const create = vi.fn().mockResolvedValue({
            id: "upstream-1",
            choices: [
                {
                    message: {
                        content: '{"diagnosis":{"suspected":"Diabete de type 2"}}',
                    },
                },
            ],
        });

        await executeOpenAIAnalyze({
            openai: {
                chat: {
                    completions: { create },
                },
            },
            model: "gpt-4.1-mini",
            diagnosis: "Diabete de type 2",
            patient: { medical_history: [], current_medications: ["Metformine"] },
            symptoms: ["Polydipsie"],
            reqAuth: { userId: "u1", username: "admin", role: "SUPERADMIN" },
            req: { ip: "127.0.0.1", headers: {} },
            fingerprint: "fp-1",
            forceRealSafe: false,
            neutralizationMeta: null,
            supportsJsonResponseFormat: vi.fn(() => true),
            recordOpenAIRequestAuditEvent: vi.fn().mockResolvedValue({ _id: "audit-1" }),
            finalizeOpenAIRequestAuditEvent: vi.fn().mockResolvedValue({}),
            getRequestIp: vi.fn(() => "127.0.0.1"),
            makeSourceHash: vi.fn(() => "hash-123"),
            detectNonSecureContent: vi.fn(() => ({ hasMatches: false })),
            respondWithSecurityIncident: vi.fn(),
            safeParseMedicalAI: vi.fn(() => ({
                diagnosis: { suspected: "Diabete de type 2" },
            })),
            normalizeClinicalAnalysis: vi.fn((parsed) => parsed),
            isPlaceholderClinicalAnalysis: vi.fn(() => false),
            recordOpenAISuccess: vi.fn(),
            recordOpenAIFailure: vi.fn(),
            res,
            logger: { log: vi.fn(), error: vi.fn() },
        });

        const request = create.mock.calls[0][0];
        expect(request.messages[0].content).toContain("GLP-1 option may merit reevaluation");
        expect(request.messages[0].content).toContain("Do not recommend prescribing");
        expect(request.messages[1].content).toContain("compare continuing the current strategy");
    });

    it("includes additional type 2 diabetes clinical context in the OpenAI prompt", async () => {
        const res = createResponseDouble();
        res.status.mockReturnValue(res);
        const create = vi.fn().mockResolvedValue({
            id: "upstream-1",
            choices: [
                {
                    message: {
                        content: '{"diagnosis":{"suspected":"Diabete de type 2"}}',
                    },
                },
            ],
        });

        await executeOpenAIAnalyze({
            openai: {
                chat: {
                    completions: { create },
                },
            },
            model: "gpt-4.1-mini",
            diagnosis: "Diabete de type 2",
            patient: {
                weight: 94,
                medical_history: [],
                current_medications: ["Metformine"],
                diabetes_context: {
                    cardiovascular_risk: "Modere a eleve",
                    renal_function: "Preservee ou legerement reduite",
                    fragility: "Faible",
                    tolerance: "Bonne tolerance a la metformine",
                    glycemic_goals: "HbA1c < 7 % si securitaire et realiste",
                },
            },
            symptoms: ["Polydipsie"],
            reqAuth: { userId: "u1", username: "admin", role: "SUPERADMIN" },
            req: { ip: "127.0.0.1", headers: {} },
            fingerprint: "fp-1",
            forceRealSafe: false,
            neutralizationMeta: null,
            supportsJsonResponseFormat: vi.fn(() => true),
            recordOpenAIRequestAuditEvent: vi.fn().mockResolvedValue({ _id: "audit-1" }),
            finalizeOpenAIRequestAuditEvent: vi.fn().mockResolvedValue({}),
            getRequestIp: vi.fn(() => "127.0.0.1"),
            makeSourceHash: vi.fn(() => "hash-123"),
            detectNonSecureContent: vi.fn(() => ({ hasMatches: false })),
            respondWithSecurityIncident: vi.fn(),
            safeParseMedicalAI: vi.fn(() => ({
                diagnosis: { suspected: "Diabete de type 2" },
            })),
            normalizeClinicalAnalysis: vi.fn((parsed) => parsed),
            isPlaceholderClinicalAnalysis: vi.fn(() => false),
            recordOpenAISuccess: vi.fn(),
            recordOpenAIFailure: vi.fn(),
            res,
            logger: { log: vi.fn(), error: vi.fn() },
        });

        const request = create.mock.calls[0][0];
        expect(request.messages[1].content).toContain("Additional type 2 diabetes clinical context:");
        expect(request.messages[1].content).toContain("- weight_kg: 94");
        expect(request.messages[1].content).toContain("- cardiovascular_risk: Modere a eleve");
        expect(request.messages[1].content).toContain("- renal_function: Preservee ou legerement reduite");
        expect(request.messages[1].content).toContain("- fragility: Faible");
        expect(request.messages[1].content).toContain("- tolerance: Bonne tolerance a la metformine");
        expect(request.messages[1].content).toContain("- glycemic_goals: HbA1c < 7 % si securitaire et realiste");
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
