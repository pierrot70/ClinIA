import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    clinicianCommentRateLimiter,
    resetClinicianCommentRateLimiterForTests,
} from "../clinicianCommentRateLimiter.js";

function createRes() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        setHeader: vi.fn(),
    };
}

describe("clinicianCommentRateLimiter", () => {
    beforeEach(() => {
        resetClinicianCommentRateLimiterForTests();
        vi.restoreAllMocks();
    });

    it("allows up to 5 comments within 15 minutes", () => {
        vi.spyOn(Date, "now").mockReturnValue(1_000);

        const req = {
            originalUrl: "/api/clinician-comments",
            ip: "203.0.113.10",
        };
        const res = createRes();
        const next = vi.fn();

        for (let i = 0; i < 5; i += 1) {
            clinicianCommentRateLimiter(req, res, next);
        }

        expect(next).toHaveBeenCalledTimes(5);
        expect(res.status).not.toHaveBeenCalled();
    });

    it("blocks the 6th comment for 15 minutes then unlocks automatically", () => {
        const nowSpy = vi.spyOn(Date, "now");
        nowSpy.mockReturnValue(10_000);

        const req = {
            originalUrl: "/api/clinician-comments",
            ip: "203.0.113.10",
        };
        const res = createRes();
        const next = vi.fn();

        for (let i = 0; i < 5; i += 1) {
            clinicianCommentRateLimiter(req, res, next);
        }

        clinicianCommentRateLimiter(req, res, next);

        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "900");
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "CLINICIAN_COMMENTS_RATE_LIMITED",
                message:
                    "Les commentaires sont temporairement bloques. Reessayez dans 15 minutes.",
                retryable: true,
            },
        });
        expect(next).toHaveBeenCalledTimes(5);

        const lockedRes = createRes();
        nowSpy.mockReturnValue(10_000 + 14 * 60 * 1000);
        clinicianCommentRateLimiter(req, lockedRes, next);
        expect(lockedRes.status).toHaveBeenCalledWith(429);

        const unlockedRes = createRes();
        nowSpy.mockReturnValue(10_000 + 15 * 60 * 1000 + 1);
        clinicianCommentRateLimiter(req, unlockedRes, next);
        expect(unlockedRes.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(6);
    });

    it("does not block another anonymous IP", () => {
        vi.spyOn(Date, "now").mockReturnValue(20_000);

        const abusiveReq = {
            originalUrl: "/api/clinician-comments",
            ip: "203.0.113.10",
        };
        const otherReq = {
            originalUrl: "/api/clinician-comments",
            ip: "198.51.100.24",
        };
        const next = vi.fn();

        for (let i = 0; i < 6; i += 1) {
            clinicianCommentRateLimiter(abusiveReq, createRes(), next);
        }

        const otherRes = createRes();
        clinicianCommentRateLimiter(otherReq, otherRes, next);

        expect(otherRes.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(6);
    });

    it("uses Cloudflare's stable client IP instead of a rotating proxy IP", () => {
        vi.spyOn(Date, "now").mockReturnValue(25_000);

        const next = vi.fn();
        const responses = [];

        for (let i = 0; i < 6; i += 1) {
            const res = createRes();
            responses.push(res);
            clinicianCommentRateLimiter(
                {
                    headers: { "cf-connecting-ip": "203.0.113.20" },
                    originalUrl: "/api/clinician-comments",
                    ip: `172.16.0.${i + 1}`,
                },
                res,
                next
            );
        }

        expect(next).toHaveBeenCalledTimes(5);
        expect(responses[5].status).toHaveBeenCalledWith(429);
    });

    it("isolates authenticated users even when they share an IP", () => {
        vi.spyOn(Date, "now").mockReturnValue(30_000);

        const abusiveReq = {
            auth: { userId: "user-a" },
            originalUrl: "/api/clinician-comments",
            ip: "203.0.113.10",
        };
        const otherReq = {
            auth: { userId: "user-b" },
            originalUrl: "/api/clinician-comments",
            ip: "203.0.113.10",
        };
        const next = vi.fn();

        for (let i = 0; i < 6; i += 1) {
            clinicianCommentRateLimiter(abusiveReq, createRes(), next);
        }

        const otherRes = createRes();
        clinicianCommentRateLimiter(otherReq, otherRes, next);

        expect(otherRes.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(6);
    });
});
