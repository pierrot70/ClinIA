import { describe, expect, it, vi } from "vitest";

import {
    createCorsOriginDelegate,
    enforceTrustedOrigin,
    getAllowedOriginsFromEnv,
    getRequestOrigin,
    isOriginAllowed,
} from "../originProtection.js";

function makeRes() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
}

describe("origin protection helpers", () => {
    it("reads allowed origins from env", () => {
        const allowedOrigins = getAllowedOriginsFromEnv({
            CLINIA_ALLOWED_ORIGINS:
                "https://app.clinia.example, https://admin.clinia.example/path",
        });

        expect(Array.from(allowedOrigins)).toEqual([
            "https://app.clinia.example",
            "https://admin.clinia.example",
        ]);
    });

    it("allows browser origins present in the allowlist", () => {
        const allowedOrigins = new Set(["https://app.clinia.example"]);

        expect(
            isOriginAllowed("https://app.clinia.example/path", allowedOrigins)
        ).toBe(true);
        expect(
            isOriginAllowed("https://evil.example", allowedOrigins)
        ).toBe(false);
    });

    it("extracts request origin from origin or referer headers", () => {
        expect(
            getRequestOrigin({
                headers: {
                    origin: "https://app.clinia.example",
                },
            })
        ).toBe("https://app.clinia.example");

        expect(
            getRequestOrigin({
                headers: {
                    referer: "https://app.clinia.example/dashboard?tab=1",
                },
            })
        ).toBe("https://app.clinia.example");
    });
});

describe("createCorsOriginDelegate", () => {
    it("allows requests without origin and allowed browser origins", () => {
        const callback = vi.fn();
        const delegate = createCorsOriginDelegate(
            new Set(["https://app.clinia.example"])
        );

        delegate(undefined, callback);
        delegate("https://app.clinia.example", callback);

        expect(callback).toHaveBeenNthCalledWith(1, null, true);
        expect(callback).toHaveBeenNthCalledWith(2, null, true);
    });

    it("rejects disallowed browser origins", () => {
        const callback = vi.fn();
        const delegate = createCorsOriginDelegate(
            new Set(["https://app.clinia.example"])
        );

        delegate("https://evil.example", callback);

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
        expect(callback.mock.calls[0][0]).toMatchObject({
            code: "CORS_ORIGIN_DENIED",
            status: 403,
        });
        expect(callback.mock.calls[0][1]).toBeUndefined();
    });
});

describe("enforceTrustedOrigin", () => {
    it("allows a trusted origin on sensitive auth actions", () => {
        const middleware = enforceTrustedOrigin(
            new Set(["https://app.clinia.example"])
        );
        const req = {
            headers: {
                origin: "https://app.clinia.example",
                cookie: "clinia_refresh_token=test",
            },
        };
        const res = makeRes();
        const next = vi.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    it("blocks cookie-backed requests without a verifiable origin", () => {
        const middleware = enforceTrustedOrigin(
            new Set(["https://app.clinia.example"])
        );
        const req = {
            headers: {
                cookie: "clinia_refresh_token=test",
            },
        };
        const res = makeRes();
        const next = vi.fn();

        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it("allows non-browser requests that do not rely on cookies", () => {
        const middleware = enforceTrustedOrigin(
            new Set(["https://app.clinia.example"])
        );
        const req = {
            headers: {},
        };
        const res = makeRes();
        const next = vi.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    it("blocks requests coming from an origin outside the allowlist", () => {
        const middleware = enforceTrustedOrigin(
            new Set(["https://app.clinia.example"])
        );
        const req = {
            headers: {
                origin: "https://evil.example",
                cookie: "clinia_refresh_token=test",
            },
        };
        const res = makeRes();
        const next = vi.fn();

        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "UNTRUSTED_ORIGIN",
                message:
                    "Origine de requete non autorisee pour cette action sensible.",
                retryable: false,
            },
        });
        expect(next).not.toHaveBeenCalled();
    });
});
