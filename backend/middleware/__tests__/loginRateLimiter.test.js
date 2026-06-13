import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    createLoginRateLimiter,
    loginRateLimiter,
    refreshRateLimiter,
} from "../loginRateLimiter.js";

function makeRes() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        setHeader: vi.fn(),
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

describe("loginRateLimiter middleware", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("allows requests under the configured limit", async () => {
        const model = createModel();
        const limiter = createLoginRateLimiter({
            RateLimitWindowModel: model,
            now: () => 1_000,
        });
        const req = { headers: {}, ip: "127.0.0.10" };

        for (let i = 0; i < 10; i += 1) {
            const res = makeRes();
            const next = vi.fn();

            await limiter(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(res.status).not.toHaveBeenCalled();
        }
    });

    it("persists a Mongo counter and blocks requests over the configured limit", async () => {
        const model = createModel();
        const limiter = createLoginRateLimiter({
            RateLimitWindowModel: model,
            now: () => 1_000,
        });
        const req = { headers: {}, ip: "127.0.0.11" };

        for (let i = 0; i < 10; i += 1) {
            await limiter(req, makeRes(), vi.fn());
        }

        const res = makeRes();
        const next = vi.fn();

        await limiter(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.setHeader).toHaveBeenCalledWith(
            "Retry-After",
            expect.any(String)
        );
        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                error: expect.objectContaining({
                    code: "RATE_LIMITED",
                }),
            })
        );
        expect(model.findOneAndUpdate).toHaveBeenCalledWith(
            {
                limiterKey: "auth_login",
                actorKey: "ip:127.0.0.11",
                windowStartedAt: new Date(0),
            },
            {
                $setOnInsert: {
                    limiterKey: "auth_login",
                    actorKey: "ip:127.0.0.11",
                    windowStartedAt: new Date(0),
                    windowMs: 900_000,
                    expiresAt: new Date(1_800_000),
                },
                $inc: { requestCount: 1 },
            },
            { upsert: true, new: true }
        );
    });

    it("keeps different client IPs in separate Mongo counters", async () => {
        const model = createModel();
        const limiter = createLoginRateLimiter({
            RateLimitWindowModel: model,
            now: () => 1_000,
        });
        const nextA = vi.fn();
        const nextB = vi.fn();

        for (let i = 0; i < 10; i += 1) {
            await limiter(
                { headers: {}, ip: "127.0.0.12" },
                makeRes(),
                nextA
            );
        }
        await limiter(
            { headers: {}, ip: "127.0.0.13" },
            makeRes(),
            nextB
        );

        expect(nextA).toHaveBeenCalledTimes(10);
        expect(nextB).toHaveBeenCalledTimes(1);
    });

    it("fails closed when Mongo cannot verify the login limit", async () => {
        const limiter = createLoginRateLimiter({
            RateLimitWindowModel: {
                findOneAndUpdate: vi
                    .fn()
                    .mockRejectedValue(new Error("mongo unavailable")),
            },
        });
        const res = makeRes();
        const next = vi.fn();

        await limiter({ headers: {}, ip: "127.0.0.14" }, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "LOGIN_RATE_LIMIT_UNAVAILABLE",
                message:
                    "Le controle des tentatives de connexion est temporairement indisponible.",
                retryable: true,
            },
        });
    });
});

describe("refreshRateLimiter middleware", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("allows requests under the configured refresh limit", () => {
        const req = { headers: {}, ip: "127.0.0.20" };

        for (let i = 0; i < 30; i += 1) {
            const res = makeRes();
            const next = vi.fn();

            refreshRateLimiter(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(res.status).not.toHaveBeenCalled();
        }
    });

    it("blocks requests over the configured refresh limit", () => {
        const req = { headers: {}, ip: "127.0.0.21" };

        for (let i = 0; i < 30; i += 1) {
            refreshRateLimiter(req, makeRes(), vi.fn());
        }

        const res = makeRes();
        const next = vi.fn();

        refreshRateLimiter(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.setHeader).toHaveBeenCalledWith(
            "Retry-After",
            expect.any(String)
        );
        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                error: expect.objectContaining({
                    code: "RATE_LIMITED",
                }),
            })
        );
    });
});
