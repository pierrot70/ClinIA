import { describe, expect, it, vi } from "vitest";

import { requireRole } from "../requireRole.js";
import { verifyJWT } from "../verifyJWT.js";

const { verify } = vi.hoisted(() => ({
    verify: vi.fn(),
}));

vi.mock("jsonwebtoken", () => ({
    default: {
        verify,
    },
}));

function makeRes() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
}

describe("verifyJWT middleware", () => {
    it("rejects missing bearer token", () => {
        const req = { headers: {} };
        const res = makeRes();
        const next = vi.fn();

        verifyJWT(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("accepts valid token and sets req.auth", () => {
        process.env.JWT_ACCESS_SECRET = "test-access-secret";
        verify.mockReturnValue({
            sub: "user-1",
            role: "ADMIN",
            username: "admin",
        });

        const req = {
            headers: {
                authorization: "Bearer token-value",
            },
        };
        const res = makeRes();
        const next = vi.fn();

        verifyJWT(req, res, next);

        expect(req.auth).toEqual({
            userId: "user-1",
            role: "ADMIN",
            username: "admin",
        });
        expect(verify).toHaveBeenCalledWith(
            "token-value",
            "test-access-secret",
            {
                algorithms: ["HS256"],
                issuer: "clinia-backend",
                audience: "clinia-app",
            }
        );
        expect(next).toHaveBeenCalledTimes(1);
    });

    it("rejects token payload with invalid role", () => {
        process.env.JWT_ACCESS_SECRET = "test-access-secret";
        verify.mockReturnValue({
            sub: "user-1",
            role: "NOT_A_ROLE",
            username: "admin",
        });

        const req = {
            headers: {
                authorization: "Bearer token-value",
            },
        };
        const res = makeRes();
        const next = vi.fn();

        verifyJWT(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });
});

describe("requireRole middleware", () => {
    it("rejects missing auth role", () => {
        const guard = requireRole("ADMIN");
        const req = { auth: null };
        const res = makeRes();
        const next = vi.fn();

        guard(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("rejects role not allowed", () => {
        const guard = requireRole("SUPERADMIN");
        const req = { auth: { role: "MEDECIN" } };
        const res = makeRes();
        const next = vi.fn();

        guard(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it("allows role in allowlist", () => {
        const guard = requireRole("ADMIN", "SUPERADMIN");
        const req = { auth: { role: "ADMIN" } };
        const res = makeRes();
        const next = vi.fn();

        guard(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
    });
});
