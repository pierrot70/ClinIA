import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindOne = vi.fn();
const mockFindById = vi.fn();
const mockCreate = vi.fn();
const mockFind = vi.fn();
const mockCountDocuments = vi.fn();

const recordAuthAuditEvent = vi.fn();

vi.mock("../../models/AdminUser.js", () => ({
    AdminUser: {
        findOne: mockFindOne,
        findById: mockFindById,
        create: mockCreate,
        find: mockFind,
        countDocuments: mockCountDocuments,
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

const { login, logout, refresh, hashPassword, register, registerSelf, listUsers, resetUserPassword, completeForcedPasswordChange } = await import("../auth.js");

function buildUser(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439011",
        username: "admin",
        passwordHash: "hashed-pw",
        role: "ADMIN",
        passwordResetRequired: false,
        mustChangePasswordOnNextLogin: false,
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
        expect(result.user.passwordResetRequired).toBe(false);
        expect(result.user.mustChangePasswordOnNextLogin).toBe(false);
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
            authTokenInvalidBefore: null,
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
        expect(user.authTokenInvalidBefore).toBeInstanceOf(Date);
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
        expect(user.authTokenInvalidBefore).toBeInstanceOf(Date);
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

    it("lists users with pagination metadata", async () => {
        mockCountDocuments.mockResolvedValue(23);
        mockFind.mockReturnValue({
            select: vi.fn().mockReturnValue({
                sort: vi.fn().mockReturnValue({
                    skip: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                            lean: vi.fn().mockResolvedValue([
                                {
                                    _id: "507f1f77bcf86cd799439015",
                                    username: "newdoctor",
                                    email: "newdoctor@clinia.local",
                                    role: "MEDECIN",
                                    isActive: true,
                                    createdAt: new Date("2026-04-04T10:00:00.000Z"),
                                    lastLoginAt: null,
                                    lastLogoutAt: null,
                                },
                            ]),
                        }),
                    }),
                }),
            }),
        });

        const result = await listUsers({
            authUser: { role: "SUPERADMIN" },
            page: 2,
            limit: 10,
        });

        expect(mockCountDocuments).toHaveBeenCalledWith({});
        expect(result.users).toHaveLength(1);
        expect(result.pagination).toEqual({
            page: 2,
            limit: 10,
            total: 23,
            totalPages: 3,
        });
    });

    it("clears forced password reset markers when superadmin resets password", async () => {
        const user = buildUser({
            massDownloadRestrictedUntil: new Date(Date.now() + 60_000),
            passwordResetRequired: true,
            mustChangePasswordOnNextLogin: false,
        });
        hash.mockResolvedValue("new-hash");
        mockFindById.mockResolvedValue(user);

        const result = await resetUserPassword({
            userId: user._id,
            newPassword: "newpassword123",
            authUser: {
                userId: "507f1f77bcf86cd799439099",
                username: "superadmin",
                role: "SUPERADMIN",
            },
            req: { headers: {}, ip: "127.0.0.1" },
        });

        expect(user.passwordHash).toBe("new-hash");
        expect(user.massDownloadRestrictedUntil).toBeNull();
        expect(user.passwordResetRequired).toBe(false);
        expect(user.mustChangePasswordOnNextLogin).toBe(false);
        expect(user.authTokenInvalidBefore).toBeInstanceOf(Date);
        expect(user.save).toHaveBeenCalledTimes(1);
        expect(result.user.passwordResetRequired).toBe(false);
    });

    it("generates a temporary password when superadmin resets without providing one", async () => {
        const user = buildUser({
            massDownloadRestrictedUntil: new Date(Date.now() + 60_000),
            passwordResetRequired: true,
        });
        hash.mockResolvedValue("temp-hash");
        mockFindById.mockResolvedValue(user);

        const result = await resetUserPassword({
            userId: user._id,
            newPassword: "",
            authUser: {
                userId: "507f1f77bcf86cd799439099",
                username: "superadmin",
                role: "SUPERADMIN",
            },
            req: { headers: {}, ip: "127.0.0.1" },
        });

        expect(typeof result.temporaryPassword).toBe("string");
        expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(8);
        expect(user.mustChangePasswordOnNextLogin).toBe(true);
        expect(user.passwordResetRequired).toBe(false);
    });

    it("lets the authenticated user complete a forced password change", async () => {
        const user = buildUser({
            mustChangePasswordOnNextLogin: true,
            passwordResetRequired: false,
        });
        hash.mockResolvedValue("final-hash");
        mockFindById.mockResolvedValue(user);

        const result = await completeForcedPasswordChange({
            authUser: {
                userId: user._id,
                username: user.username,
                role: user.role,
            },
            newPassword: "brandnewpass123",
            req: { headers: {}, ip: "127.0.0.1" },
        });

        expect(result).toEqual({ success: true });
        expect(user.passwordHash).toBe("final-hash");
        expect(user.mustChangePasswordOnNextLogin).toBe(false);
        expect(user.authTokenInvalidBefore).toBeInstanceOf(Date);
        expect(user.save).toHaveBeenCalledTimes(1);
    });

    it("applies search and role filters to paginated user listing", async () => {
        mockCountDocuments.mockResolvedValue(1);
        mockFind.mockReturnValue({
            select: vi.fn().mockReturnValue({
                sort: vi.fn().mockReturnValue({
                    skip: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                            lean: vi.fn().mockResolvedValue([
                                {
                                    _id: "507f1f77bcf86cd799439099",
                                    username: "doctor.house",
                                    email: "doctor.house@clinia.local",
                                    role: "MEDECIN",
                                    isActive: true,
                                    createdAt: new Date("2026-04-05T08:00:00.000Z"),
                                    lastLoginAt: null,
                                    lastLogoutAt: null,
                                },
                            ]),
                        }),
                    }),
                }),
            }),
        });

        const result = await listUsers({
            authUser: { role: "SUPERADMIN" },
            page: 1,
            limit: 10,
            search: "doctor.house",
            role: "medecin",
        });

        expect(mockCountDocuments).toHaveBeenCalledWith({
            $or: [
                { username: { $regex: "doctor\\.house", $options: "i" } },
                { email: { $regex: "doctor\\.house", $options: "i" } },
            ],
            role: "MEDECIN",
        });
        expect(mockFind).toHaveBeenCalledWith({
            $or: [
                { username: { $regex: "doctor\\.house", $options: "i" } },
                { email: { $regex: "doctor\\.house", $options: "i" } },
            ],
            role: "MEDECIN",
        });
        expect(result.filters).toEqual({
            search: "doctor.house",
            role: "MEDECIN",
        });
    });
});
