import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    configureCoreMiddleware,
    createSecurityHeadersMiddleware,
    getTrustedProxyCidrs,
} from "../configureCoreMiddleware.js";

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

    it("does not trust a forwarded HTTPS header from an untrusted peer", () => {
        process.env.NODE_ENV = "production";
        const middleware = createSecurityHeadersMiddleware();
        const json = vi.fn();
        const res = {
            setHeader: vi.fn(),
            status: vi.fn(() => ({ json })),
        };

        middleware(
            {
                secure: false,
                headers: {
                    host: "clinique-ai.ca",
                    "x-forwarded-proto": "https",
                },
                url: "/api/test",
                method: "GET",
            },
            res,
            vi.fn()
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(json).toHaveBeenCalledWith({
            error: {
                code: "HTTPS_REQUIRED",
                message: "HTTPS est requis.",
                retryable: false,
            },
        });
    });

    it("sets a restrictive content security policy", () => {
        const middleware = createSecurityHeadersMiddleware();
        const res = {
            setHeader: vi.fn(),
            status: vi.fn(),
        };

        middleware(
            {
                secure: false,
                headers: { host: "localhost" },
                url: "/api/test",
                method: "GET",
            },
            res,
            vi.fn()
        );

        expect(res.setHeader).toHaveBeenCalledWith(
            "Content-Security-Policy",
            expect.stringContaining("default-src 'self'")
        );
        expect(res.setHeader).toHaveBeenCalledWith(
            "Content-Security-Policy",
            expect.stringContaining("object-src 'none'")
        );
    });

    it("uses configured proxy CIDRs instead of a hop count", () => {
        expect(
            getTrustedProxyCidrs({
                CLINIA_TRUST_PROXY_CIDRS: "10.0.0.0/8, 172.16.0.0/12",
            })
        ).toEqual(["10.0.0.0/8", "172.16.0.0/12"]);

        const app = { set: vi.fn(), use: vi.fn() };
        configureCoreMiddleware(app);

        expect(app.set).toHaveBeenCalledWith(
            "trust proxy",
            expect.arrayContaining(["loopback", "linklocal", "uniquelocal"])
        );
    });
});
