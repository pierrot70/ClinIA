import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    getOpenAIAnalyzeQuotaStatus,
    openAIAnalyzeQuotaGuard,
    resetOpenAIAnalyzeQuotaGuardForTests,
} from "../openaiAnalyzeQuotaGuard.js";

function createRes() {
    return {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
}

describe("openAIAnalyzeQuotaGuard", () => {
    const originalNodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
        resetOpenAIAnalyzeQuotaGuardForTests();
        vi.restoreAllMocks();
    });

    it("does nothing in development", () => {
        process.env.NODE_ENV = "development";
        const req = { originalUrl: "/api/ai/analyze" };
        const res = createRes();
        const next = vi.fn();

        for (let i = 0; i < 10; i += 1) {
            openAIAnalyzeQuotaGuard(req, res, next);
        }

        expect(next).toHaveBeenCalledTimes(10);
        expect(res.status).not.toHaveBeenCalled();
    });

    it("ignores anonymous demo requests because they cannot call OpenAI", () => {
        process.env.NODE_ENV = "production";
        const req = { originalUrl: "/api/ai/analyze" };
        const res = createRes();
        const next = vi.fn();

        for (let i = 0; i < 10; i += 1) {
            openAIAnalyzeQuotaGuard(req, res, next);
        }

        expect(next).toHaveBeenCalledTimes(10);
        expect(res.status).not.toHaveBeenCalled();
    });

    it("rate limits one user without locking other users", () => {
        process.env.NODE_ENV = "production";
        vi.spyOn(Date, "now").mockReturnValue(1_000);

        const req = {
            auth: { userId: "user-a" },
            originalUrl: "/api/ai/analyze",
        };
        const res = createRes();
        const next = vi.fn();

        for (let i = 0; i < 5; i += 1) {
            openAIAnalyzeQuotaGuard(req, res, next);
        }

        expect(next).toHaveBeenCalledTimes(5);
        expect(res.status).not.toHaveBeenCalled();

        openAIAnalyzeQuotaGuard(req, res, next);

        expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "60");
        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "OPENAI_ANALYZE_RATE_LIMITED",
                message:
                    "Trop d'analyses cliniques. Reessayez dans quelques instants.",
                retryable: true,
            },
        });

        const otherUserNext = vi.fn();
        openAIAnalyzeQuotaGuard(
            {
                auth: { userId: "user-b" },
                originalUrl: "/api/ai/analyze",
            },
            createRes(),
            otherUserNext
        );
        expect(otherUserNext).toHaveBeenCalledTimes(1);

        expect(getOpenAIAnalyzeQuotaStatus()).toEqual({
            enabled: true,
            state: "open",
            locked: false,
            activeBuckets: 2,
            maxRequestsPerWindow: 5,
            windowMs: 60_000,
        });
    });

    it("automatically allows a user again after the window resets", () => {
        process.env.NODE_ENV = "production";
        const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
        const req = {
            auth: { userId: "user-a" },
            originalUrl: "/api/ai/analyze",
        };
        const res = createRes();
        const next = vi.fn();

        for (let i = 0; i < 6; i += 1) {
            openAIAnalyzeQuotaGuard(req, res, next);
        }

        now.mockReturnValue(61_001);
        const resetNext = vi.fn();
        openAIAnalyzeQuotaGuard(req, createRes(), resetNext);

        expect(resetNext).toHaveBeenCalledTimes(1);
    });
});
