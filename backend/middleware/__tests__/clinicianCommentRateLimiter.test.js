import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    clinicianCommentRateLimiter,
    resetClinicianCommentRateLimiterForTests,
} from "../clinicianCommentRateLimiter.js";

function createRes() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
}

describe("clinicianCommentRateLimiter", () => {
    beforeEach(() => {
        resetClinicianCommentRateLimiterForTests();
        vi.restoreAllMocks();
    });

    it("allows up to 5 comments within 15 minutes", () => {
        vi.spyOn(Date, "now").mockReturnValue(1_000);

        const req = { originalUrl: "/api/clinician-comments" };
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

        const req = { originalUrl: "/api/clinician-comments" };
        const res = createRes();
        const next = vi.fn();

        for (let i = 0; i < 5; i += 1) {
            clinicianCommentRateLimiter(req, res, next);
        }

        clinicianCommentRateLimiter(req, res, next);

        expect(res.status).toHaveBeenCalledWith(429);
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
});
