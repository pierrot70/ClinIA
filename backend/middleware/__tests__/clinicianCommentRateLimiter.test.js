import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClinicianCommentRateLimiter } from "../clinicianCommentRateLimiter.js";

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

describe("clinicianCommentRateLimiter", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("persists comments and blocks the sixth within 15 minutes", async () => {
        const model = createModel();
        const limiter = createClinicianCommentRateLimiter({
            RateLimitWindowModel: model,
            now: () => 1_000,
        });
        const req = {
            originalUrl: "/api/clinician-comments",
            ip: "203.0.113.10",
        };
        const res = createRes();
        const next = vi.fn();

        for (let i = 0; i < 6; i += 1) {
            await limiter(req, res, next);
        }

        expect(next).toHaveBeenCalledTimes(5);
        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "899");
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "CLINICIAN_COMMENTS_RATE_LIMITED",
                message:
                    "Les commentaires sont temporairement bloques. Reessayez dans 15 minutes.",
                retryable: true,
            },
        });
        expect(model.findOneAndUpdate).toHaveBeenCalledWith(
            {
                limiterKey: "clinician_comments",
                actorKey: "ip:203.0.113.10",
                windowStartedAt: new Date(0),
            },
            {
                $setOnInsert: {
                    limiterKey: "clinician_comments",
                    actorKey: "ip:203.0.113.10",
                    windowStartedAt: new Date(0),
                    windowMs: 900_000,
                    expiresAt: new Date(1_800_000),
                },
                $inc: { requestCount: 1 },
            },
            { upsert: true, new: true }
        );
    });

    it("unlocks automatically in the next aligned window", async () => {
        const model = createModel();
        let nowMs = 1_000;
        const limiter = createClinicianCommentRateLimiter({
            RateLimitWindowModel: model,
            now: () => nowMs,
        });
        const req = { headers: {}, ip: "203.0.113.11" };
        const next = vi.fn();

        for (let i = 0; i < 6; i += 1) {
            await limiter(req, createRes(), next);
        }

        nowMs = 900_001;
        const unlockedRes = createRes();
        await limiter(req, unlockedRes, next);

        expect(unlockedRes.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(6);
    });

    it("does not block another anonymous IP", async () => {
        const limiter = createClinicianCommentRateLimiter({
            RateLimitWindowModel: createModel(),
            now: () => 20_000,
        });
        const next = vi.fn();

        for (let i = 0; i < 6; i += 1) {
            await limiter(
                { headers: {}, ip: "203.0.113.12" },
                createRes(),
                next
            );
        }

        const otherRes = createRes();
        await limiter(
            { headers: {}, ip: "198.51.100.24" },
            otherRes,
            next
        );

        expect(otherRes.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(6);
    });

    it("cannot bypass anonymous comments by rotating forwarding headers", async () => {
        const limiter = createClinicianCommentRateLimiter({
            RateLimitWindowModel: createModel(),
            now: () => 25_000,
        });
        const next = vi.fn();
        const responses = [];

        for (let i = 0; i < 6; i += 1) {
            const res = createRes();
            responses.push(res);
            await limiter(
                {
                    headers: {
                        "cf-connecting-ip": `203.0.113.${i + 1}`,
                        "x-forwarded-for": `198.51.100.${i + 1}`,
                    },
                    ip: "203.0.113.20",
                },
                res,
                next
            );
        }

        expect(next).toHaveBeenCalledTimes(5);
        expect(responses[5].status).toHaveBeenCalledWith(429);
    });

    it("isolates authenticated users even when they share an IP", async () => {
        const limiter = createClinicianCommentRateLimiter({
            RateLimitWindowModel: createModel(),
            now: () => 30_000,
        });
        const next = vi.fn();

        for (let i = 0; i < 6; i += 1) {
            await limiter(
                { auth: { userId: "user-a" }, ip: "203.0.113.10" },
                createRes(),
                next
            );
        }

        const otherRes = createRes();
        await limiter(
            { auth: { userId: "user-b" }, ip: "203.0.113.10" },
            otherRes,
            next
        );

        expect(otherRes.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(6);
    });

    it("fails closed when Mongo cannot verify the comment limit", async () => {
        const limiter = createClinicianCommentRateLimiter({
            RateLimitWindowModel: {
                findOneAndUpdate: vi
                    .fn()
                    .mockRejectedValue(new Error("mongo unavailable")),
            },
        });
        const res = createRes();
        const next = vi.fn();

        await limiter({ headers: {}, ip: "203.0.113.30" }, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "CLINICIAN_COMMENTS_RATE_LIMIT_UNAVAILABLE",
                message:
                    "Le controle des commentaires est temporairement indisponible.",
                retryable: true,
            },
        });
    });
});
