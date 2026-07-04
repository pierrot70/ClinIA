import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "../requireRole.js";
import { verifyDiagnosticJWT, verifyJWT } from "../verifyJWT.js";

const { verify } = vi.hoisted(() => ({
    verify: vi.fn(),
}));

const { findById } = vi.hoisted(() => ({
    findById: vi.fn(),
}));

const { touchSessionActivity, validateSessionState } = vi.hoisted(() => ({
    touchSessionActivity: vi.fn().mockResolvedValue(undefined),
    validateSessionState: vi.fn().mockResolvedValue(undefined),
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

vi.mock("../../services/auth.js", () => ({
    touchSessionActivity,
    validateSessionState,
}));

function makeRes() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

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
            select: vi.fn().mockResolvedValue({
                _id: "user-1",
                role: "ADMIN",
                username: "admin",
                isActive: true,
                authTokenInvalidBefore: null,
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
            passwordResetRequired: false,
            mustChangePasswordOnNextLogin: false,
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
        expect(validateSessionState).toHaveBeenCalledTimes(1);
        expect(touchSessionActivity).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledTimes(1);
    });

    it("blocks protected access while a forced password reset is pending", async () => {
        process.env.JWT_ACCESS_SECRET = "test-access-secret";
        verify.mockReturnValue({
            sub: "user-1",
            role: "ADMIN",
            username: "admin",
            iat: Math.floor(Date.now() / 1000),
        });
        findById.mockReturnValue({
            select: vi.fn().mockResolvedValue({
                _id: "user-1",
                role: "ADMIN",
                username: "admin",
                isActive: true,
                authTokenInvalidBefore: null,
                passwordResetRequired: true,
            }),
        });

        const req = {
            method: "GET",
            originalUrl: "/api/patients?page=1&limit=10",
            headers: {
                authorization: "Bearer token-value",
            },
        };
        const res = makeRes();
        const next = vi.fn();

        await verifyJWT(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "PASSWORD_RESET_REQUIRED",
                message: "Un changement de mot de passe est requis avant de poursuivre.",
                retryable: false,
            },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it("still allows /api/auth/session while a forced password reset is pending", async () => {
        process.env.JWT_ACCESS_SECRET = "test-access-secret";
        verify.mockReturnValue({
            sub: "user-1",
            role: "ADMIN",
            username: "admin",
            iat: Math.floor(Date.now() / 1000),
        });
        findById.mockReturnValue({
            select: vi.fn().mockResolvedValue({
                _id: "user-1",
                role: "ADMIN",
                username: "admin",
                isActive: true,
                authTokenInvalidBefore: null,
                passwordResetRequired: true,
            }),
        });

        const req = {
            method: "GET",
            originalUrl: "/api/auth/session",
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
            passwordResetRequired: true,
            mustChangePasswordOnNextLogin: false,
        });
        expect(next).toHaveBeenCalledTimes(1);
    });

    it("blocks protected access while a forced password change on next login is pending", async () => {
        process.env.JWT_ACCESS_SECRET = "test-access-secret";
        verify.mockReturnValue({
            sub: "user-1",
            role: "ADMIN",
            username: "admin",
            iat: Math.floor(Date.now() / 1000),
        });
        findById.mockReturnValue({
            select: vi.fn().mockResolvedValue({
                _id: "user-1",
                role: "ADMIN",
                username: "admin",
                isActive: true,
                authTokenInvalidBefore: null,
                passwordResetRequired: false,
                mustChangePasswordOnNextLogin: true,
            }),
        });

        const req = {
            method: "GET",
            originalUrl: "/api/patients?page=1&limit=10",
            headers: {
                authorization: "Bearer token-value",
            },
        };
        const res = makeRes();
        const next = vi.fn();

        await verifyJWT(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "PASSWORD_CHANGE_REQUIRED",
                message: "Vous devez choisir un nouveau mot de passe avant de poursuivre.",
                retryable: false,
            },
        });
        expect(next).not.toHaveBeenCalled();
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
            select: vi.fn().mockResolvedValue({
                _id: "user-1",
                role: "ADMIN",
                username: "admin",
                isActive: true,
                authTokenInvalidBefore: new Date("2026-04-19T10:00:01.000Z"),
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

describe("verifyDiagnosticJWT middleware", () => {
    it("accepts a valid signed token without reading or touching Mongo-backed session state", () => {
        process.env.JWT_ACCESS_SECRET = "test-access-secret";
        verify.mockReturnValue({
            sub: "user-1",
            role: "SUPERADMIN",
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

        verifyDiagnosticJWT(req, res, next);

        expect(req.auth).toEqual({
            userId: "user-1",
            role: "SUPERADMIN",
            username: "admin",
            passwordResetRequired: false,
            mustChangePasswordOnNextLogin: false,
            diagnosticAuth: true,
        });
        expect(findById).not.toHaveBeenCalled();
        expect(validateSessionState).not.toHaveBeenCalled();
        expect(touchSessionActivity).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
    });

    it("rejects diagnostic access when the signed token role is not valid", () => {
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

        verifyDiagnosticJWT(req, res, next);

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
