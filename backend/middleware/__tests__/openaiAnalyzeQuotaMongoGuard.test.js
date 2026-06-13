import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    createOpenAIAnalyzeQuotaGuard,
    getOpenAIAnalyzeQuotaStatus,
} from "../openaiAnalyzeQuotaGuard.js";

function createRes() {
    return {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
}

function createModel() {
    const counts = new Map();

    return {
        findOneAndUpdate: vi.fn(async (query) => {
            const key = `${query.limiterKey}:${query.actorKey}:${query.windowStartedAt.toISOString()}`;
            const requestCount = (counts.get(key) || 0) + 1;
            counts.set(key, requestCount);
            return { requestCount };
        }),
    };
}

describe("Mongo-backed openAIAnalyzeQuotaGuard", () => {
    const originalNodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
        vi.restoreAllMocks();
    });

    it("does nothing in development", async () => {
        process.env.NODE_ENV = "development";
        const model = createModel();
        const guard = createOpenAIAnalyzeQuotaGuard({
            RateLimitWindowModel: model,
        });
        const next = vi.fn();

        await guard({ auth: { userId: "user-a" } }, createRes(), next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("ignores anonymous demo requests", async () => {
        process.env.NODE_ENV = "production";
        const model = createModel();
        const guard = createOpenAIAnalyzeQuotaGuard({
            RateLimitWindowModel: model,
        });
        const next = vi.fn();

        await guard({}, createRes(), next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("persists an atomic Mongo counter and blocks the sixth request", async () => {
        process.env.NODE_ENV = "production";
        const model = createModel();
        const guard = createOpenAIAnalyzeQuotaGuard({
            RateLimitWindowModel: model,
            now: () => 1_000,
        });
        const req = {
            auth: { userId: "user-a" },
            originalUrl: "/api/ai/analyze",
        };
        const res = createRes();
        const next = vi.fn();

        for (let i = 0; i < 6; i += 1) {
            await guard(req, res, next);
        }

        expect(next).toHaveBeenCalledTimes(5);
        expect(model.findOneAndUpdate).toHaveBeenCalledTimes(6);
        expect(model.findOneAndUpdate).toHaveBeenCalledWith(
            {
                limiterKey: "openai_analyze",
                actorKey: "user:user-a",
                windowStartedAt: new Date(0),
            },
            {
                $setOnInsert: {
                    limiterKey: "openai_analyze",
                    actorKey: "user:user-a",
                    windowStartedAt: new Date(0),
                    windowMs: 60_000,
                    expiresAt: new Date(120_000),
                },
                $inc: { requestCount: 1 },
            },
            { upsert: true, new: true }
        );
        expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "59");
        expect(res.status).toHaveBeenCalledWith(429);
    });

    it("keeps different users in separate Mongo counters", async () => {
        process.env.NODE_ENV = "production";
        const model = createModel();
        const guard = createOpenAIAnalyzeQuotaGuard({
            RateLimitWindowModel: model,
            now: () => 1_000,
        });
        const nextA = vi.fn();
        const nextB = vi.fn();

        for (let i = 0; i < 5; i += 1) {
            await guard(
                { auth: { userId: "user-a" } },
                createRes(),
                nextA
            );
        }
        await guard(
            { auth: { userId: "user-b" } },
            createRes(),
            nextB
        );

        expect(nextA).toHaveBeenCalledTimes(5);
        expect(nextB).toHaveBeenCalledTimes(1);
    });

    it("fails closed when Mongo cannot verify the quota", async () => {
        process.env.NODE_ENV = "production";
        const guard = createOpenAIAnalyzeQuotaGuard({
            RateLimitWindowModel: {
                findOneAndUpdate: vi
                    .fn()
                    .mockRejectedValue(new Error("mongo unavailable")),
            },
        });
        const res = createRes();
        const next = vi.fn();

        await guard({ auth: { userId: "user-a" } }, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "OPENAI_ANALYZE_QUOTA_UNAVAILABLE",
                message:
                    "Le controle du quota OpenAI est temporairement indisponible.",
                retryable: true,
            },
        });
    });

    it("reports Mongo as the shared quota storage", () => {
        process.env.NODE_ENV = "production";

        expect(getOpenAIAnalyzeQuotaStatus()).toEqual({
            enabled: true,
            state: "open",
            locked: false,
            storage: "mongo",
            maxRequestsPerWindow: 5,
            windowMs: 60_000,
        });
    });
});
