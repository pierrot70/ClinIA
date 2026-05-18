import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSecurityHeadersMiddleware } from "../configureCoreMiddleware.js";

describe("createSecurityHeadersMiddleware", () => {
    const originalNodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
        vi.restoreAllMocks();
        process.env.NODE_ENV = originalNodeEnv;
    });

    it("blocks insecure production requests on non-local hosts", () => {
        process.env.NODE_ENV = "production";
        const middleware = createSecurityHeadersMiddleware();
        const json = vi.fn();
        const res = {
            setHeader: vi.fn(),
            status: vi.fn(() => ({ json })),
        };
        const next = vi.fn();

        middleware(
            {
                secure: false,
                headers: {
                    host: "clinique-ai.ca",
                    "x-forwarded-proto": "http",
                },
                url: "/api/test",
                method: "GET",
            },
            res,
            next
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(json).toHaveBeenCalledWith({
            error: {
                code: "HTTPS_REQUIRED",
                message: "HTTPS est requis.",
                retryable: false,
            },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it("allows secure requests and sets HSTS", () => {
        process.env.NODE_ENV = "production";
        const middleware = createSecurityHeadersMiddleware();
        const res = {
            setHeader: vi.fn(),
            status: vi.fn(),
        };
        const next = vi.fn();

        middleware(
            {
                secure: true,
                headers: {
                    host: "clinique-ai.ca",
                },
                url: "/api/test",
                method: "GET",
            },
            res,
            next
        );

        expect(res.setHeader).toHaveBeenCalledWith(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains"
        );
        expect(next).toHaveBeenCalledTimes(1);
    });
});
