import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClinicianReplyLookupRateLimiter } from "../clinicianReplyLookupRateLimiter.js";

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

describe("clinicianReplyLookupRateLimiter", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("persists lookups and blocks the 11th within 15 minutes", async () => {
        const model = createModel();
        const limiter = createClinicianReplyLookupRateLimiter({
            RateLimitWindowModel: model,
            now: () => 1_000,
        });
        const req = {
            headers: { "cf-connecting-ip": "203.0.113.30" },
            originalUrl: "/api/clinician-comments/lookup-replies",
            ip: "172.16.0.2",
        };
        const next = vi.fn();

        for (let i = 0; i < 10; i += 1) {
            await limiter(req, createRes(), next);
        }

        const blockedRes = createRes();
        await limiter(req, blockedRes, next);

        expect(next).toHaveBeenCalledTimes(10);
        expect(blockedRes.setHeader).toHaveBeenCalledWith("Retry-After", "899");
        expect(blockedRes.status).toHaveBeenCalledWith(429);
        expect(blockedRes.json).toHaveBeenCalledWith({
            error: {
                code: "CLINICIAN_REPLY_LOOKUP_RATE_LIMITED",
                message:
                    "Trop de tentatives de consultation. Reessayez dans 15 minutes.",
                retryable: true,
            },
        });
        expect(model.findOneAndUpdate).toHaveBeenCalledWith(
            {
                limiterKey: "clinician_reply_lookup",
                actorKey: "ip:203.0.113.30",
                windowStartedAt: new Date(0),
            },
            {
                $setOnInsert: {
                    limiterKey: "clinician_reply_lookup",
                    actorKey: "ip:203.0.113.30",
                    windowStartedAt: new Date(0),
                    windowMs: 900_000,
                    expiresAt: new Date(1_800_000),
                },
                $inc: { requestCount: 1 },
            },
            { upsert: true, new: true }
        );
    });

    it("uses Cloudflare's client IP across rotating proxy IPs", async () => {
        const limiter = createClinicianReplyLookupRateLimiter({
            RateLimitWindowModel: createModel(),
            now: () => 2_000,
        });
        const next = vi.fn();
        const responses = [];

        for (let i = 0; i < 11; i += 1) {
            const res = createRes();
            responses.push(res);
            await limiter(
                {
                    headers: { "cf-connecting-ip": "203.0.113.31" },
                    ip: `172.16.0.${i + 1}`,
                },
                res,
                next
            );
        }

        expect(next).toHaveBeenCalledTimes(10);
        expect(responses[10].status).toHaveBeenCalledWith(429);
    });

    it("does not block another client IP", async () => {
        const limiter = createClinicianReplyLookupRateLimiter({
            RateLimitWindowModel: createModel(),
            now: () => 3_000,
        });
        const next = vi.fn();

        for (let i = 0; i < 11; i += 1) {
            await limiter(
                { headers: {}, ip: "203.0.113.32" },
                createRes(),
                next
            );
        }

        const otherRes = createRes();
        await limiter(
            { headers: {}, ip: "198.51.100.32" },
            otherRes,
            next
        );

        expect(otherRes.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(11);
    });

    it("fails closed when Mongo cannot verify the lookup limit", async () => {
        const limiter = createClinicianReplyLookupRateLimiter({
            RateLimitWindowModel: {
                findOneAndUpdate: vi
                    .fn()
                    .mockRejectedValue(new Error("mongo unavailable")),
            },
        });
        const res = createRes();
        const next = vi.fn();

        await limiter({ headers: {}, ip: "203.0.113.33" }, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "CLINICIAN_REPLY_LOOKUP_RATE_LIMIT_UNAVAILABLE",
                message:
                    "Le controle des consultations est temporairement indisponible.",
                retryable: true,
            },
        });
    });
});
