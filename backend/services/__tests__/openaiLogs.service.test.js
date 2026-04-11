import { beforeEach, describe, expect, it, vi } from "vitest";

const openAILogCountDocuments = vi.fn();
const openAILogFind = vi.fn();

vi.mock("../../models/OpenAIRequestAuditLog.js", () => ({
    OpenAIRequestAuditLog: {
        countDocuments: openAILogCountDocuments,
        find: openAILogFind,
    },
}));

const { exportOpenAILogsCsv, listOpenAILogs } = await import("../openaiLogs.js");

beforeEach(() => {
    vi.clearAllMocks();
});

describe("openai logs service", () => {
    it("lists OpenAI logs with field filters for admins", async () => {
        openAILogCountDocuments.mockResolvedValue(1);
        openAILogFind.mockReturnValue({
            sort: vi.fn().mockReturnValue({
                skip: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                        lean: vi.fn().mockResolvedValue([
                            {
                                _id: "507f1f77bcf86cd799439031",
                                action: "AI_ANALYZE_REQUEST",
                                outcome: "SUCCESS",
                                actorUserId: "507f1f77bcf86cd799439011",
                                actorUsernameMasked: "ad***",
                                actorRole: "ADMIN",
                                ip: "203.0.113.20",
                                requestPath: "/api/ai/analyze",
                                transport: "openai_chat_completions",
                                model: "gpt-4.1-mini",
                                payloadHash: "abc123",
                                payloadSizeBytes: 512,
                                dataClassification: "ANONYMIZED_MEDICAL",
                                acknowledgmentIncidentId: null,
                                neutralized: false,
                                upstreamRequestId: "req_123",
                                errorCode: null,
                                requestContext: {
                                    symptomCount: 2,
                                    forceReal: true,
                                },
                                timestamp: new Date("2026-04-11T10:00:00.000Z"),
                            },
                        ]),
                    }),
                }),
            }),
        });

        const result = await listOpenAILogs({
            authUser: { role: "ADMIN" },
            page: "1",
            limit: "20",
            startDate: "2026-04-10",
            endDate: "2026-04-11",
            action: "AI_ANALYZE_REQUEST",
            outcome: "SUCCESS",
            actorRole: "ADMIN",
            actorUsernameMasked: "ad",
            requestPath: "/api/ai/analyze",
            model: "gpt-4.1",
            payloadHash: "abc",
            payloadSizeBytes: "512",
            dataClassification: "ANONYMIZED_MEDICAL",
            neutralized: "false",
            upstreamRequestId: "req_",
            ip: "203.0.113",
        });

        expect(openAILogCountDocuments).toHaveBeenCalledWith({
            $and: [
                {
                    timestamp: {
                        $gte: new Date("2026-04-10T00:00:00.000"),
                        $lte: new Date("2026-04-11T23:59:59.999"),
                    },
                },
                { action: "AI_ANALYZE_REQUEST" },
                { outcome: "SUCCESS" },
                { actorUsernameMasked: /ad/i },
                { actorRole: "ADMIN" },
                { ip: /203\.0\.113/i },
                { requestPath: /\/api\/ai\/analyze/i },
                { model: /gpt-4\.1/i },
                { payloadHash: /abc/i },
                { payloadSizeBytes: 512 },
                { dataClassification: "ANONYMIZED_MEDICAL" },
                { neutralized: false },
                { upstreamRequestId: /req_/i },
            ],
        });
        expect(result.pagination.total).toBe(1);
        expect(result.logs[0].model).toBe("gpt-4.1-mini");
    });

    it("rejects OpenAI audit access for non-admins", async () => {
        await expect(
            listOpenAILogs({
                authUser: { role: "USER" },
            })
        ).rejects.toEqual({
            code: "FORBIDDEN",
            message: "Action reservee aux administrateurs.",
        });
    });

    it("exports filtered OpenAI logs as CSV", async () => {
        openAILogFind.mockReturnValue({
            sort: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                    lean: vi.fn().mockResolvedValue([
                        {
                            _id: "507f1f77bcf86cd799439031",
                            action: "AI_ANALYZE_REQUEST",
                            outcome: "FAILED",
                            actorUserId: "507f1f77bcf86cd799439011",
                            actorUsernameMasked: "ad***",
                            actorRole: "ADMIN",
                            ip: "203.0.113.20",
                            requestPath: "/api/ai/analyze",
                            transport: "openai_chat_completions",
                            model: "gpt-4.1-mini",
                            payloadHash: "abc123",
                            payloadSizeBytes: 512,
                            dataClassification: "ANONYMIZED_MEDICAL",
                            acknowledgmentIncidentId: null,
                            neutralized: false,
                            upstreamRequestId: "req_123",
                            errorCode: "OPENAI_UPSTREAM_FAILED",
                            requestContext: { symptomCount: 2 },
                            timestamp: new Date("2026-04-11T10:00:00.000Z"),
                        },
                    ]),
                }),
            }),
        });

        const result = await exportOpenAILogsCsv({
            authUser: { role: "SUPERADMIN" },
            outcome: "FAILED",
        });

        expect(result.truncated).toBe(false);
        expect(result.csv).toContain("timestamp,action,outcome");
        expect(result.csv).toContain("AI_ANALYZE_REQUEST");
        expect(result.csv).toContain("OPENAI_UPSTREAM_FAILED");
    });
});