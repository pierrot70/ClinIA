import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    clinicianReplyLookupRateLimiter,
    resetClinicianReplyLookupRateLimiterForTests,
} from "../clinicianReplyLookupRateLimiter.js";

function createRes() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        setHeader: vi.fn(),
    };
}

describe("clinicianReplyLookupRateLimiter", () => {
    beforeEach(() => {
        resetClinicianReplyLookupRateLimiterForTests();
        vi.restoreAllMocks();
    });

    it("blocks the 11th reply lookup within 15 minutes", () => {
        vi.spyOn(Date, "now").mockReturnValue(1_000);
        const req = {
            headers: { "cf-connecting-ip": "203.0.113.30" },
            originalUrl: "/api/clinician-comments/lookup-replies",
            ip: "172.16.0.2",
        };
        const next = vi.fn();

        for (let i = 0; i < 10; i += 1) {
            clinicianReplyLookupRateLimiter(req, createRes(), next);
        }

        const blockedRes = createRes();
        clinicianReplyLookupRateLimiter(req, blockedRes, next);

        expect(next).toHaveBeenCalledTimes(10);
        expect(blockedRes.setHeader).toHaveBeenCalledWith("Retry-After", "900");
        expect(blockedRes.status).toHaveBeenCalledWith(429);
        expect(blockedRes.json).toHaveBeenCalledWith({
            error: {
                code: "CLINICIAN_REPLY_LOOKUP_RATE_LIMITED",
                message:
                    "Trop de tentatives de consultation. Reessayez dans 15 minutes.",
                retryable: true,
            },
        });
    });

    it("uses Cloudflare's client IP across rotating proxy IPs", () => {
        vi.spyOn(Date, "now").mockReturnValue(2_000);
        const next = vi.fn();
        const responses = [];

        for (let i = 0; i < 11; i += 1) {
            const res = createRes();
            responses.push(res);
            clinicianReplyLookupRateLimiter(
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

    it("does not block another client IP", () => {
        vi.spyOn(Date, "now").mockReturnValue(3_000);
        const next = vi.fn();

        for (let i = 0; i < 11; i += 1) {
            clinicianReplyLookupRateLimiter(
                { headers: {}, ip: "203.0.113.32" },
                createRes(),
                next
            );
        }

        const otherRes = createRes();
        clinicianReplyLookupRateLimiter(
            { headers: {}, ip: "198.51.100.32" },
            otherRes,
            next
        );

        expect(otherRes.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(11);
    });
});
