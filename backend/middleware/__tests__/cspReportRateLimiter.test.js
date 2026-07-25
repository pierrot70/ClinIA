import { describe, expect, it, vi } from "vitest";

import { createCspReportRateLimiter } from "../cspReportRateLimiter.js";

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

function createRes() {
    return {
        status: vi.fn().mockReturnThis(),
        end: vi.fn(),
    };
}

describe("CSP report rate limiter", () => {
    it("allows 30 reports per client then silently drops further reports", async () => {
        const limiter = createCspReportRateLimiter({
            RateLimitWindowModel: createModel(),
            now: () => 1_000,
        });
        const next = vi.fn();
        const request = {
            headers: { "cf-connecting-ip": "198.51.100.91" },
            ip: "203.0.113.91",
        };

        for (let index = 0; index < 30; index += 1) {
            await limiter(request, createRes(), next);
        }

        const blocked = createRes();
        await limiter(request, blocked, next);

        expect(next).toHaveBeenCalledTimes(30);
        expect(blocked.status).toHaveBeenCalledWith(204);
        expect(blocked.end).toHaveBeenCalledTimes(1);
    });
});
