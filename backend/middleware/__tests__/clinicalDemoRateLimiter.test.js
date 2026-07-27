import { describe, expect, it, vi } from "vitest";

import {
    ANONYMOUS_CLINICAL_DEMO_MAX_REQUESTS,
    createClinicalDemoRateLimiter,
} from "../clinicalDemoRateLimiter.js";

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

describe("clinicalDemoRateLimiter", () => {
    it("uses a shared Mongo counter and blocks the fourth anonymous request", async () => {
        const limiter = createClinicalDemoRateLimiter({
            RateLimitWindowModel: createModel(),
            now: () => 1_000,
        });
        const next = vi.fn();
        const responses = [];

        for (let index = 0; index <= ANONYMOUS_CLINICAL_DEMO_MAX_REQUESTS; index += 1) {
            const res = createRes();
            responses.push(res);
            await limiter(
                {
                    ip: "203.0.113.10",
                    headers: { "x-forwarded-for": `198.51.100.${index}` },
                },
                res,
                next
            );
        }

        expect(next).toHaveBeenCalledTimes(ANONYMOUS_CLINICAL_DEMO_MAX_REQUESTS);
        expect(responses.at(-1).status).toHaveBeenCalledWith(429);
        expect(responses.at(-1).json).toHaveBeenCalledWith({
            error: expect.objectContaining({
                code: "ANONYMOUS_CLINICAL_DEMO_RATE_LIMITED",
            }),
        });
    });

    it("fails closed when Mongo cannot enforce the anonymous quota", async () => {
        const limiter = createClinicalDemoRateLimiter({
            RateLimitWindowModel: {
                findOneAndUpdate: vi.fn().mockRejectedValue(new Error("mongo unavailable")),
            },
        });
        const res = createRes();
        const next = vi.fn();

        await limiter({ ip: "203.0.113.11" }, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith({
            error: expect.objectContaining({
                code: "ANONYMOUS_CLINICAL_DEMO_QUOTA_UNAVAILABLE",
            }),
        });
    });
});
