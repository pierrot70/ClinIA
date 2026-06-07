import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    passwordRecoveryRequestRateLimiter,
    passwordRecoveryVerifyRateLimiter,
    resetPasswordRecoveryRateLimitersForTests,
} from "../passwordRecoveryRateLimiter.js";

function createRes() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        setHeader: vi.fn(),
    };
}

describe("password recovery rate limiters", () => {
    beforeEach(() => {
        resetPasswordRecoveryRateLimitersForTests();
        vi.restoreAllMocks();
        vi.spyOn(Date, "now").mockReturnValue(1_000);
    });

    it("blocks the sixth recovery request from one IP", () => {
        const req = {
            headers: { "cf-connecting-ip": "203.0.113.40" },
            ip: "172.16.0.2",
        };
        const next = vi.fn();

        for (let i = 0; i < 5; i += 1) {
            passwordRecoveryRequestRateLimiter(req, createRes(), next);
        }

        const blockedRes = createRes();
        passwordRecoveryRequestRateLimiter(req, blockedRes, next);

        expect(next).toHaveBeenCalledTimes(5);
        expect(blockedRes.status).toHaveBeenCalledWith(429);
        expect(blockedRes.setHeader).toHaveBeenCalledWith("Retry-After", "900");
    });

    it("allows fifteen verification attempts then blocks the next one", () => {
        const req = { headers: {}, ip: "203.0.113.41" };
        const next = vi.fn();

        for (let i = 0; i < 15; i += 1) {
            passwordRecoveryVerifyRateLimiter(req, createRes(), next);
        }

        const blockedRes = createRes();
        passwordRecoveryVerifyRateLimiter(req, blockedRes, next);

        expect(next).toHaveBeenCalledTimes(15);
        expect(blockedRes.status).toHaveBeenCalledWith(429);
    });

    it("does not block another IP", () => {
        const next = vi.fn();

        for (let i = 0; i < 6; i += 1) {
            passwordRecoveryRequestRateLimiter(
                { headers: {}, ip: "203.0.113.42" },
                createRes(),
                next
            );
        }

        const otherRes = createRes();
        passwordRecoveryRequestRateLimiter(
            { headers: {}, ip: "198.51.100.42" },
            otherRes,
            next
        );

        expect(otherRes.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(6);
    });
});
