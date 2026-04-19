import { describe, expect, it, vi } from "vitest";

import { requireRole } from "../requireRole.js";
import { verifyJWT } from "../verifyJWT.js";

const { verify } = vi.hoisted(() => ({
    verify: vi.fn(),
}));

const { findById } = vi.hoisted(() => ({
    findById: vi.fn(),
}));

vi.mock("jsonwebtoken", () => ({
    default: {
        verify,
    },
}));

vi.mock("../../models/AdminUser.js", () => ({
    AdminUser: {
        findById,
    },
}));

function makeRes() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
}

describe("verifyJWT middleware", () => {
    it("rejects missing bearer token", async () => {
        const req = { headers: {} };
        const res = makeRes();
        const next = vi.fn();

        await verifyJWT(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("accepts valid token and sets req.auth", async () => {
        process.env.JWT_ACCESS_SECRET = "test-access-secret";
        verify.mockReturnValue({
            sub: "user-1",
            role: "ADMIN",
            username: "admin",
            iat: Math.floor(Date.now() / 1000),
        });
        findById.mockReturnValue({
            select: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue({
                    _id: "user-1",
                    role: "ADMIN",
                    username: "admin",
                    isActive: true,
                    authTokenInvalidBefore: null,
                }),
            }),
        });

        const req = {
            headers: {
                authorization: "Bearer token-value",
            },
        };
        const res = makeRes();
        const next = vi.fn();

        await verifyJWT(req, res, next);

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

    it("rejects token payload with invalid role", async () => {
        process.env.JWT_ACCESS_SECRET = "test-access-secret";
        verify.mockReturnValue({
            sub: "user-1",
            role: "NOT_A_ROLE",
            username: "admin",
            iat: Math.floor(Date.now() / 1000),
        });

        const req = {
            headers: {
                authorization: "Bearer token-value",
            },
        };
        const res = makeRes();
        const next = vi.fn();

        await verifyJWT(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("rejects access token revoked by server-side invalidation timestamp", async () => {
        process.env.JWT_ACCESS_SECRET = "test-access-secret";
        verify.mockReturnValue({
            sub: "user-1",
            role: "ADMIN",
            username: "admin",
            iat: Math.floor(new Date("2026-04-19T10:00:00.000Z").getTime() / 1000),
        });
        findById.mockReturnValue({
            select: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue({
                    _id: "user-1",
                    role: "ADMIN",
                    username: "admin",
                    isActive: true,
                    authTokenInvalidBefore: new Date("2026-04-19T10:00:01.000Z"),
                }),
            }),
        });

        const req = {
            headers: {
                authorization: "Bearer token-value",
            },
        };
        const res = makeRes();
        const next = vi.fn();

        await verifyJWT(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "TOKEN_REVOKED",
                message: "Session invalidee. Reconnectez-vous.",
                retryable: false,
            },
        });
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
