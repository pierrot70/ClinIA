import { beforeEach, describe, expect, it, vi } from "vitest";

import {
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

describe("loginRateLimiter middleware", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("allows requests under the configured limit", () => {
        const req = { headers: {}, ip: "127.0.0.10" };

        for (let i = 0; i < 10; i += 1) {
            const res = makeRes();
            const next = vi.fn();

            loginRateLimiter(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(res.status).not.toHaveBeenCalled();
        }
    });

    it("blocks requests over the configured limit", () => {
        const req = { headers: {}, ip: "127.0.0.11" };

        for (let i = 0; i < 10; i += 1) {
            loginRateLimiter(req, makeRes(), vi.fn());
        }

        const res = makeRes();
        const next = vi.fn();

        loginRateLimiter(req, res, next);

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
