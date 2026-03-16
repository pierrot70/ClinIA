import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindOne = vi.fn();
const mockFindById = vi.fn();
const mockCreate = vi.fn();

const recordAuthAuditEvent = vi.fn();

vi.mock("../../models/AdminUser.js", () => ({
    AdminUser: {
        findOne: mockFindOne,
        findById: mockFindById,
        create: mockCreate,
    },
}));

vi.mock("../../audit/authAudit.js", () => ({
    recordAuthAuditEvent,
}));

const compare = vi.fn();
const hash = vi.fn();

vi.mock("bcryptjs", () => ({
    default: {
        compare,
        hash,
    },
}));

const sign = vi.fn();

vi.mock("jsonwebtoken", () => ({
    default: {
        sign,
    },
}));

const { login, logout, refresh, hashPassword, register, registerSelf } = await import("../auth.js");

function buildUser(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439011",
        username: "admin",
        passwordHash: "hashed-pw",
        role: "ADMIN",
        failedLoginAttempts: 0,
        lockUntil: null,
        refreshTokenHash: null,
        refreshTokenExpiresAt: null,
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_ACCESS_SECRET = "test-access-secret";
});

describe("auth service", () => {
    it("logs in with email and rotates refresh token", async () => {
        const user = buildUser();
        mockFindOne.mockResolvedValue(user);
        compare.mockResolvedValue(true);
        sign.mockReturnValue("access-token");

        const result = await login({
            email: "admin@example.com",
            password: "password123",
            req: { headers: {}, ip: "127.0.0.1" },
        });

        expect(mockFindOne).toHaveBeenCalledWith({
            $or: [
                { username: "admin@example.com" },
                { email: "admin@example.com" },
            ],
        });
        expect(result.accessToken).toBe("access-token");
        expect(result.refreshToken).toBeTypeOf("string");
        expect(result.refreshToken.length).toBeGreaterThan(40);
        expect(user.refreshTokenHash).toBeTypeOf("string");
        expect(user.failedLoginAttempts).toBe(0);
        expect(user.save).toHaveBeenCalledTimes(1);
        expect(recordAuthAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "LOGIN",
                outcome: "SUCCESS",
            })
        );
    });

    it("logs in with username and rotates refresh token", async () => {
        const user = buildUser();
        mockFindOne.mockResolvedValue(user);
        compare.mockResolvedValue(true);
        sign.mockReturnValue("access-token");

        const result = await login({
            username: "admin",
            password: "password123",
            req: { headers: {}, ip: "127.0.0.1" },
        });

        expect(result.accessToken).toBe("access-token");
        expect(result.refreshToken).toBeTypeOf("string");
        expect(result.refreshToken.length).toBeGreaterThan(40);
        expect(user.refreshTokenHash).toBeTypeOf("string");
        expect(user.failedLoginAttempts).toBe(0);
        expect(user.save).toHaveBeenCalledTimes(1);
        expect(recordAuthAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "LOGIN",
                outcome: "SUCCESS",
            })
        );
    });

    it("rejects invalid identifier payload", async () => {
        await expect(
            login({
                username: { $ne: "admin" },
                password: "password123",
                req: { headers: {}, ip: "127.0.0.1" },
            })
        ).rejects.toMatchObject({
            code: "INVALID_INPUT",
        });

        expect(mockFindOne).not.toHaveBeenCalled();
        expect(recordAuthAuditEvent).not.toHaveBeenCalled();
    });

    it("increments failed attempts for invalid credentials", async () => {
        const user = buildUser();
        mockFindOne.mockResolvedValue(user);
        compare.mockResolvedValue(false);

        await expect(
            login({
                username: "admin",
                password: "password123",
                req: { headers: {}, ip: "127.0.0.1" },
            })
        ).rejects.toMatchObject({
            code: "INVALID_CREDENTIALS",
        });

        expect(user.failedLoginAttempts).toBe(1);
        expect(user.save).toHaveBeenCalledTimes(1);
        expect(recordAuthAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "FAILED_LOGIN",
                outcome: "FAILED",
                reason: "INVALID_CREDENTIALS",
            })
        );
    });

    it("locks account after repeated failed logins", async () => {
        const user = buildUser({ failedLoginAttempts: 4 });
        mockFindOne.mockResolvedValue(user);
        compare.mockResolvedValue(false);

        await expect(
            login({
                username: "admin",
                password: "password123",
                req: { headers: {}, ip: "127.0.0.1" },
            })
        ).rejects.toMatchObject({
            code: "INVALID_CREDENTIALS",
        });

        expect(user.failedLoginAttempts).toBe(0);
        expect(user.lockUntil).toBeInstanceOf(Date);
    });

    it("rejects refresh with unknown token", async () => {
        mockFindOne.mockResolvedValue(null);

        await expect(
            refresh({
                refreshToken: "a".repeat(64),
                req: { headers: {}, ip: "127.0.0.1" },
            })
        ).rejects.toMatchObject({
            code: "INVALID_REFRESH_TOKEN",
        });
    });

    it("rotates refresh token when refresh is valid", async () => {
        const user = buildUser({
            refreshTokenHash: "old-hash",
            refreshTokenExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
        });
        mockFindOne.mockResolvedValue(user);
        sign.mockReturnValue("new-access-token");

        const result = await refresh({
            refreshToken: "a".repeat(64),
            req: { headers: {}, ip: "127.0.0.1" },
        });

        expect(result.accessToken).toBe("new-access-token");
        expect(result.refreshToken).toBeTypeOf("string");
        expect(result.refreshToken.length).toBeGreaterThan(40);
        expect(user.save).toHaveBeenCalledTimes(1);
        expect(user.refreshTokenHash).not.toBe("old-hash");
    });

    it("invalidates expired refresh token", async () => {
        const user = buildUser({
            refreshTokenHash: "old-hash",
            refreshTokenExpiresAt: new Date(Date.now() - 1_000),
        });
        mockFindOne.mockResolvedValue(user);

        await expect(
            refresh({
                refreshToken: "a".repeat(64),
                req: { headers: {}, ip: "127.0.0.1" },
            })
        ).rejects.toMatchObject({
            code: "REFRESH_TOKEN_EXPIRED",
        });

        expect(user.refreshTokenHash).toBeNull();
        expect(user.refreshTokenExpiresAt).toBeNull();
        expect(user.save).toHaveBeenCalledTimes(1);
    });

    it("logs out by authenticated user and records logout audit", async () => {
        const user = buildUser({
            refreshTokenHash: "old-hash",
            refreshTokenExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
        });
        mockFindById.mockResolvedValue(user);

        const result = await logout({
            refreshToken: null,
            authUser: { userId: user._id },
            req: { headers: {}, ip: "127.0.0.1" },
        });

        expect(result).toEqual({ success: true });
        expect(user.refreshTokenHash).toBeNull();
        expect(user.refreshTokenExpiresAt).toBeNull();
        expect(user.lastLogoutAt).toBeInstanceOf(Date);
        expect(user.save).toHaveBeenCalledTimes(1);
        expect(recordAuthAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "LOGOUT",
                outcome: "SUCCESS",
                userId: user._id,
            })
        );
    });

    it("hashes password with bcrypt", async () => {
        hash.mockResolvedValue("hashed");

        const out = await hashPassword("password123");
        expect(out).toBe("hashed");
    });

    it("registers a new user when admin is authenticated", async () => {
        mockFindOne.mockResolvedValue(null);
        hash.mockResolvedValue("hashed-password");
        mockCreate.mockResolvedValue({
            _id: "507f1f77bcf86cd799439015",
            username: "newdoctor",
            email: "newdoctor@clinia.local",
            role: "MEDECIN",
        });

        const result = await register({
            username: "newdoctor",
            email: "newdoctor@clinia.local",
            password: "password123",
            role: "MEDECIN",
            authUser: {
                userId: "507f1f77bcf86cd799439011",
                username: "admin",
                role: "ADMIN",
            },
            req: { headers: {}, ip: "127.0.0.1" },
        });

        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                username: "newdoctor",
                email: "newdoctor@clinia.local",
                role: "MEDECIN",
                passwordHash: "hashed-password",
            })
        );
        expect(result.user.username).toBe("newdoctor");
        expect(recordAuthAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "REGISTER",
                outcome: "SUCCESS",
            })
        );
    });

    it("rejects superadmin creation by non-superadmin", async () => {
        await expect(
            register({
                username: "newsuper",
                email: "newsuper@clinia.local",
                password: "password123",
                role: "SUPERADMIN",
                authUser: {
                    userId: "507f1f77bcf86cd799439011",
                    username: "admin",
                    role: "ADMIN",
                },
                req: { headers: {}, ip: "127.0.0.1" },
            })
        ).rejects.toMatchObject({
            code: "FORBIDDEN",
        });

        expect(mockCreate).not.toHaveBeenCalled();
    });

    it("self-registers a MEDECIN with email/password", async () => {
        mockFindOne.mockResolvedValue(null);
        hash.mockResolvedValue("hashed-password");
        mockCreate.mockResolvedValue({
            _id: "507f1f77bcf86cd799439099",
            username: "drsmith",
            email: "drsmith@clinia.local",
            role: "MEDECIN",
        });

        const result = await registerSelf({
            email: "drsmith@clinia.local",
            password: "password123",
            req: { headers: {}, ip: "127.0.0.1" },
        });

        expect(result.user.email).toBe("drsmith@clinia.local");
        expect(result.user.role).toBe("MEDECIN");
        expect(mockCreate).toHaveBeenCalled();
        expect(recordAuthAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "REGISTER",
                outcome: "SUCCESS",
                reason: "SELF_REGISTER",
            })
        );
    });

    it("rejects self-register if email already exists", async () => {
        mockFindOne.mockResolvedValue(buildUser({ email: "exists@clinia.local" }));

        await expect(
            registerSelf({
                email: "exists@clinia.local",
                password: "password123",
                req: { headers: {}, ip: "127.0.0.1" },
            })
        ).rejects.toMatchObject({
            code: "USER_EXISTS",
        });

        expect(mockCreate).not.toHaveBeenCalled();
    });
});
