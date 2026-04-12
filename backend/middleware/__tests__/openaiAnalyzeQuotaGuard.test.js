import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    openAIAnalyzeQuotaGuard,
    resetOpenAIAnalyzeQuotaGuardForTests,
} from "../openaiAnalyzeQuotaGuard.js";

function createRes() {
    return {
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

    it("locks the analyze route after more than 5 requests in one minute in production", () => {
        process.env.NODE_ENV = "production";
        vi.spyOn(Date, "now").mockReturnValue(1_000);

        const req = { originalUrl: "/api/ai/analyze" };
        const res = createRes();
        const next = vi.fn();

        for (let i = 0; i < 5; i += 1) {
            openAIAnalyzeQuotaGuard(req, res, next);
        }

        expect(next).toHaveBeenCalledTimes(5);
        expect(res.status).not.toHaveBeenCalled();

        openAIAnalyzeQuotaGuard(req, res, next);

        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "OPENAI_ANALYZE_SATURATED",
                message:
                    "Coolify est sature pour l'analyse clinique. Reessayez plus tard.",
                retryable: true,
            },
        });

        const lockedRes = createRes();
        openAIAnalyzeQuotaGuard(req, lockedRes, next);

        expect(lockedRes.status).toHaveBeenCalledWith(503);
        expect(next).toHaveBeenCalledTimes(5);
    });
});

