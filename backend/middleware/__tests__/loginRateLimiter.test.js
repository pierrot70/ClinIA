import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOGIN_RATE_LIMIT_MAX_ATTEMPTS } from "../../auth/constants.js";

import {
    createLoginRateLimiter,
    createRefreshRateLimiter,
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
    it("allows normal shared-clinic traffic beyond ten requests without exempting SUPERADMIN", async () => {
        expect(LOGIN_RATE_LIMIT_MAX_ATTEMPTS).toBe(100);
        const limiter = createLoginRateLimiter({ RateLimitWindowModel: createModel(), now: () => 1000 });
        const next = vi.fn();
        for (let i = 0; i < 100; i++) {
            const res = makeRes();
            await limiter({ ip: "192.0.2.1", headers: {}, body: { username: `synthetic-${i}`, role: i % 2 ? "SUPERADMIN" : "RECEPTION" } }, res, next);
            expect(res.status).not.toHaveBeenCalled();
        }
        expect(next).toHaveBeenCalledTimes(100);
        const res = makeRes();
        await limiter({ ip: "192.0.2.1", headers: {}, body: { username: "synthetic-superadmin", role: "SUPERADMIN" } }, res, next);
        expect(res.status).toHaveBeenCalledWith(429);
        expect(next).toHaveBeenCalledTimes(100);
    });
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

        for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_ATTEMPTS; i += 1) {
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

        for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_ATTEMPTS; i += 1) {
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

        for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_ATTEMPTS; i += 1) {
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

        expect(nextA).toHaveBeenCalledTimes(LOGIN_RATE_LIMIT_MAX_ATTEMPTS);
        expect(nextB).toHaveBeenCalledTimes(1);
    });

    it("cannot bypass the login limit by rotating client-controlled forwarding headers", async () => {
        const limiter = createLoginRateLimiter({
            RateLimitWindowModel: createModel(),
            now: () => 1_000,
        });
        const next = vi.fn();
        const responses = [];

        for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_ATTEMPTS + 1; i += 1) {
            const res = makeRes();
            responses.push(res);
            await limiter(
                {
                    headers: {
                        "cf-connecting-ip": `203.0.113.${i + 1}`,
                        "x-forwarded-for": `198.51.100.${i + 1}`,
                    },
                    ip: "203.0.113.60",
                },
                res,
                next
            );
        }

        expect(next).toHaveBeenCalledTimes(LOGIN_RATE_LIMIT_MAX_ATTEMPTS);
        expect(responses[LOGIN_RATE_LIMIT_MAX_ATTEMPTS].status).toHaveBeenCalledWith(429);
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

    it("allows requests under the configured refresh limit", async () => {
        const limiter = createRefreshRateLimiter({
            RateLimitWindowModel: createModel(),
            now: () => 1_000,
        });
        const req = { headers: {}, ip: "127.0.0.20" };

        for (let i = 0; i < 30; i += 1) {
            const res = makeRes();
            const next = vi.fn();

            await limiter(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(res.status).not.toHaveBeenCalled();
        }
    });

    it("persists a Mongo counter and blocks requests over the refresh limit", async () => {
        const model = createModel();
        const limiter = createRefreshRateLimiter({
            RateLimitWindowModel: model,
            now: () => 1_000,
        });
        const req = { headers: {}, ip: "127.0.0.21" };

        for (let i = 0; i < 30; i += 1) {
            await limiter(req, makeRes(), vi.fn());
        }

        const res = makeRes();
        const next = vi.fn();

        await limiter(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "299");
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
                limiterKey: "auth_refresh",
                actorKey: "ip:127.0.0.21",
                windowStartedAt: new Date(0),
            },
            {
                $setOnInsert: {
                    limiterKey: "auth_refresh",
                    actorKey: "ip:127.0.0.21",
                    windowStartedAt: new Date(0),
                    windowMs: 300_000,
                    expiresAt: new Date(600_000),
                },
                $inc: { requestCount: 1 },
            },
            { upsert: true, new: true }
        );
    });

    it("keeps different client IPs in separate refresh counters", async () => {
        const limiter = createRefreshRateLimiter({
            RateLimitWindowModel: createModel(),
            now: () => 1_000,
        });
        const nextA = vi.fn();
        const nextB = vi.fn();

        for (let i = 0; i < 30; i += 1) {
            await limiter(
                { headers: {}, ip: "127.0.0.22" },
                makeRes(),
                nextA
            );
        }
        await limiter(
            { headers: {}, ip: "127.0.0.23" },
            makeRes(),
            nextB
        );

        expect(nextA).toHaveBeenCalledTimes(30);
        expect(nextB).toHaveBeenCalledTimes(1);
    });

    it("cannot bypass the refresh limit by rotating client-controlled forwarding headers", async () => {
        const limiter = createRefreshRateLimiter({
            RateLimitWindowModel: createModel(),
            now: () => 1_000,
        });
        const next = vi.fn();
        const responses = [];

        for (let i = 0; i < 31; i += 1) {
            const res = makeRes();
            responses.push(res);
            await limiter(
                {
                    headers: {
                        "cf-connecting-ip": `203.0.113.${i + 1}`,
                        "x-forwarded-for": `198.51.100.${i + 1}`,
                    },
                    ip: "203.0.113.61",
                },
                res,
                next
            );
        }

        expect(next).toHaveBeenCalledTimes(30);
        expect(responses[30].status).toHaveBeenCalledWith(429);
    });

    it("fails closed when Mongo cannot verify the refresh limit", async () => {
        const limiter = createRefreshRateLimiter({
            RateLimitWindowModel: {
                findOneAndUpdate: vi
                    .fn()
                    .mockRejectedValue(new Error("mongo unavailable")),
            },
        });
        const res = makeRes();
        const next = vi.fn();

        await limiter({ headers: {}, ip: "127.0.0.24" }, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "REFRESH_RATE_LIMIT_UNAVAILABLE",
                message:
                    "Le controle des rafraichissements est temporairement indisponible.",
                retryable: true,
            },
        });
    });
});
