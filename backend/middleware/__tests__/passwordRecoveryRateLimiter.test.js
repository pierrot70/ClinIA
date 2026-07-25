import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPasswordRecoveryRateLimiter } from "../passwordRecoveryRateLimiter.js";

function createRes() {
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

function createLimiter({
    model = createModel(),
    limiterKey = "password_recovery_request",
    maximum = 5,
    code = "PASSWORD_RECOVERY_REQUEST_RATE_LIMITED",
    message = "Trop de demandes. Reessayez dans 15 minutes.",
} = {}) {
    return createPasswordRecoveryRateLimiter({
        limiterKey,
        maximum,
        code,
        message,
        RateLimitWindowModel: model,
        now: () => 1_000,
    });
}

describe("password recovery rate limiters", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("persists request attempts and blocks the sixth from one IP", async () => {
        const model = createModel();
        const limiter = createLimiter({ model });
        const req = {
            headers: { "cf-connecting-ip": "203.0.113.40" },
            ip: "203.0.113.40",
        };
        const next = vi.fn();

        for (let i = 0; i < 5; i += 1) {
            await limiter(req, createRes(), next);
        }

        const blockedRes = createRes();
        await limiter(req, blockedRes, next);

        expect(next).toHaveBeenCalledTimes(5);
        expect(blockedRes.status).toHaveBeenCalledWith(429);
        expect(blockedRes.setHeader).toHaveBeenCalledWith("Retry-After", "899");
        expect(model.findOneAndUpdate).toHaveBeenCalledWith(
            {
                limiterKey: "password_recovery_request",
                actorKey: "ip:203.0.113.40",
                windowStartedAt: new Date(0),
            },
            {
                $setOnInsert: {
                    limiterKey: "password_recovery_request",
                    actorKey: "ip:203.0.113.40",
                    windowStartedAt: new Date(0),
                    windowMs: 900_000,
                    expiresAt: new Date(1_800_000),
                },
                $inc: { requestCount: 1 },
            },
            { upsert: true, new: true }
        );
    });

    it("allows fifteen verification attempts then blocks the next one", async () => {
        const limiter = createLimiter({
            limiterKey: "password_recovery_verify",
            maximum: 15,
            code: "PASSWORD_RECOVERY_VERIFY_RATE_LIMITED",
            message: "Trop de tentatives. Reessayez dans 15 minutes.",
        });
        const req = { headers: {}, ip: "203.0.113.41" };
        const next = vi.fn();

        for (let i = 0; i < 15; i += 1) {
            await limiter(req, createRes(), next);
        }

        const blockedRes = createRes();
        await limiter(req, blockedRes, next);

        expect(next).toHaveBeenCalledTimes(15);
        expect(blockedRes.status).toHaveBeenCalledWith(429);
    });

    it("does not block another IP", async () => {
        const limiter = createLimiter();
        const next = vi.fn();

        for (let i = 0; i < 6; i += 1) {
            await limiter(
                { headers: {}, ip: "203.0.113.42" },
                createRes(),
                next
            );
        }

        const otherRes = createRes();
        await limiter(
            { headers: {}, ip: "198.51.100.42" },
            otherRes,
            next
        );

        expect(otherRes.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(6);
    });

    it("keeps request and verification counters separate", async () => {
        const model = createModel();
        const requestLimiter = createLimiter({ model });
        const verifyLimiter = createLimiter({
            model,
            limiterKey: "password_recovery_verify",
            maximum: 15,
            code: "PASSWORD_RECOVERY_VERIFY_RATE_LIMITED",
            message: "Trop de tentatives. Reessayez dans 15 minutes.",
        });
        const req = { headers: {}, ip: "203.0.113.43" };
        const requestNext = vi.fn();
        const verifyNext = vi.fn();

        for (let i = 0; i < 6; i += 1) {
            await requestLimiter(req, createRes(), requestNext);
        }
        await verifyLimiter(req, createRes(), verifyNext);

        expect(requestNext).toHaveBeenCalledTimes(5);
        expect(verifyNext).toHaveBeenCalledTimes(1);
    });

    it("fails closed when Mongo cannot verify the limit", async () => {
        const limiter = createPasswordRecoveryRateLimiter({
            limiterKey: "password_recovery_request",
            maximum: 5,
            code: "PASSWORD_RECOVERY_REQUEST_RATE_LIMITED",
            message: "Trop de demandes. Reessayez dans 15 minutes.",
            RateLimitWindowModel: {
                findOneAndUpdate: vi
                    .fn()
                    .mockRejectedValue(new Error("mongo unavailable")),
            },
        });
        const res = createRes();
        const next = vi.fn();

        await limiter({ headers: {}, ip: "203.0.113.44" }, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "PASSWORD_RECOVERY_RATE_LIMIT_UNAVAILABLE",
                message:
                    "Le controle de recuperation du mot de passe est temporairement indisponible.",
                retryable: true,
            },
        });
    });
});
