import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindOne = vi.fn();
const mockFindById = vi.fn();
const mockFindOneAndUpdate = vi.fn();
const mockCreate = vi.fn();
const mockFind = vi.fn();
const mockCountDocuments = vi.fn();
const mockAuthAuditCountDocuments = vi.fn();
const mockAuthAuditFind = vi.fn();
const mockAuthAuditAggregate = vi.fn();

const recordAuthAuditEvent = vi.fn();
const createRefreshTokenFamilyId = vi.fn(() => "family-123");
const createRefreshTokenSession = vi.fn();
const findRefreshTokenSession = vi.fn();
const hasActiveRefreshTokenSessionsForUser = vi.fn();
const listActiveRefreshTokenSessionsForUser = vi.fn();
const revokeRefreshTokenSessionForUser = vi.fn();
const revokeRefreshTokenFamiliesForUser = vi.fn();
const revokeRefreshTokenFamily = vi.fn();
const rotateActiveRefreshTokenSession = vi.fn();
const createSecurityIncident = vi.fn();
const clearLoginFailureThrottle = vi.fn();
const getLoginFailureThrottle = vi.fn();
const recordLoginFailure = vi.fn();

vi.mock("../../models/AdminUser.js", () => ({
    AdminUser: {
        findOne: mockFindOne,
        findById: mockFindById,
        findOneAndUpdate: mockFindOneAndUpdate,
        create: mockCreate,
        find: mockFind,
        countDocuments: mockCountDocuments,
    },
}));

vi.mock("../../models/AuthAuditLog.js", () => ({
    AuthAuditLog: {
        countDocuments: mockAuthAuditCountDocuments,
        find: mockAuthAuditFind,
        aggregate: mockAuthAuditAggregate,
    },
}));

vi.mock("../../audit/authAudit.js", () => ({
    recordAuthAuditEvent,
}));

vi.mock("../../services/securityIncidents.js", () => ({
    createSecurityIncident,
}));

vi.mock("../../services/auth/loginFailureThrottle.js", () => ({
    clearLoginFailureThrottle,
    getLoginFailureThrottle,
    recordLoginFailure,
}));

vi.mock("../../services/auth/refreshTokenFamilies.js", () => ({
    createRefreshTokenFamilyId,
    createRefreshTokenSession,
    findRefreshTokenSession,
    hasActiveRefreshTokenSessionsForUser,
    listActiveRefreshTokenSessionsForUser,
    revokeRefreshTokenSessionForUser,
    revokeRefreshTokenFamiliesForUser,
    revokeRefreshTokenFamily,
    rotateActiveRefreshTokenSession,
    REFRESH_TOKEN_SESSION_STATUS: {
        ACTIVE: "ACTIVE",
        ROTATED: "ROTATED",
        REVOKED: "REVOKED",
        EXPIRED: "EXPIRED",
    },
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
const verify = vi.fn();

vi.mock("jsonwebtoken", () => ({
    default: {
        sign,
        verify,
    },
}));

const createMfaSecret = vi.fn();
const createRecoveryCodes = vi.fn();
const decryptMfaSecret = vi.fn();
const encryptMfaSecret = vi.fn();
const hashRecoveryCode = vi.fn((code) => `hash:${code}`);
const verifyTotp = vi.fn();

vi.mock("../auth/mfa.js", () => ({
    buildProvisioningUri: vi.fn(),
    createMfaSecret,
    createRecoveryCodes,
    decryptMfaSecret,
    encryptMfaSecret,
    hashRecoveryCode,
    MFA_CHALLENGE_TTL_SECONDS: 300,
    verifyTotp,
}));

const {
    login,
    logout,
    refresh,
    hashPassword,
    register,
    registerSelf,
    listUsers,
    updateUser,
    listAuthLogGraphs,
    listAuthLogs,
    resetUserPassword,
    completeForcedPasswordChange,
    completeMfaLogin,
} = await import("../auth.js");

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
        isActive: true,
        mfaEnabled: false,
        mfaRequired: false,
        mfaSecretEncrypted: null,
        mfaPendingSecretEncrypted: null,
        mfaPendingExpiresAt: null,
        mfaRecoveryCodeHashes: [],
        mfaChallengeId: null,
        mfaChallengePurpose: null,
        mfaChallengeExpiresAt: null,
        mfaChallengeAttempts: 0,
        mfaLockedUntil: null,
        activeSessionId: null,
        activeSessionIds: [],
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    createRefreshTokenFamilyId.mockReturnValue("family-123");
    createRefreshTokenSession.mockResolvedValue(undefined);
    findRefreshTokenSession.mockResolvedValue(null);
    hasActiveRefreshTokenSessionsForUser.mockResolvedValue(false);
    listActiveRefreshTokenSessionsForUser.mockResolvedValue([]);
    revokeRefreshTokenSessionForUser.mockResolvedValue(undefined);
    revokeRefreshTokenFamiliesForUser.mockResolvedValue(undefined);
    revokeRefreshTokenFamily.mockResolvedValue(undefined);
    rotateActiveRefreshTokenSession.mockResolvedValue(null);
    createSecurityIncident.mockResolvedValue(undefined);
    clearLoginFailureThrottle.mockResolvedValue(undefined);
    getLoginFailureThrottle.mockResolvedValue({ blocked: false, blockedUntil: null });
    recordLoginFailure.mockResolvedValue({
        blocked: false,
        newlyBlocked: false,
        penaltyLevel: 0,
        shouldCreateIncident: false,
    });
    mockFindOneAndUpdate.mockResolvedValue(null);
    createMfaSecret.mockReturnValue("mfa-secret");
    createRecoveryCodes.mockReturnValue(["recovery-code"]);
    decryptMfaSecret.mockReturnValue("mfa-secret");
    encryptMfaSecret.mockImplementation((secret) => `encrypted:${secret}`);
    verifyTotp.mockReturnValue(true);
    hashRecoveryCode.mockImplementation((code) => `hash:${code}`);
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
        expect(clearLoginFailureThrottle).toHaveBeenCalledWith({
            userId: user._id,
            ip: "127.0.0.1",
        });
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

    it("persists a single-use server-side MFA challenge before returning it", async () => {
        const user = buildUser({ mfaRequired: true, mfaEnabled: false });
        mockFindOne.mockResolvedValue(user);
        compare.mockResolvedValue(true);
        sign.mockReturnValue("mfa-challenge-token");

        const result = await login({
            email: "admin@example.com",
            password: "password123",
            req: { headers: {}, ip: "127.0.0.1" },
        });

        expect(result).toMatchObject({
            mfaRequired: true,
            mfaEnrollmentRequired: true,
            mfaChallenge: "mfa-challenge-token",
        });
        expect(user.mfaChallengeId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f-]{27}$/i
        );
        expect(user.mfaChallengePurpose).toBe("mfa-enroll");
        expect(user.mfaChallengeAttempts).toBe(0);
        expect(user.save).toHaveBeenCalledTimes(1);
        expect(sign).toHaveBeenCalledWith(
            expect.objectContaining({ purpose: "mfa-enroll" }),
            "test-access-secret",
            expect.objectContaining({ jwtid: user.mfaChallengeId })
        );
    });

    it("requires MFA enrollment before replacing an active optional-MFA session", async () => {
        const user = buildUser({ mfaEnabled: false, mfaRequired: false });
        mockFindOne.mockResolvedValue(user);
        compare.mockResolvedValue(true);
        hasActiveRefreshTokenSessionsForUser.mockResolvedValue(true);
        sign.mockReturnValue("mfa-challenge-token");

        const result = await login({
            email: "admin@example.com",
            password: "password123",
            req: { headers: {}, ip: "127.0.0.1" },
        });

        expect(result).toMatchObject({
            mfaRequired: true,
            mfaEnrollmentRequired: true,
            mfaChallenge: "mfa-challenge-token",
        });
        expect(user.mfaChallengePurpose).toBe("mfa-concurrent-enroll");
        expect(revokeRefreshTokenFamiliesForUser).not.toHaveBeenCalled();
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

    it("records failed credentials against the account and source", async () => {
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

        expect(recordLoginFailure).toHaveBeenCalledWith({
            userId: user._id,
            ip: "127.0.0.1",
        });
        expect(user.save).not.toHaveBeenCalled();
        expect(recordAuthAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "FAILED_LOGIN",
                outcome: "FAILED",
                reason: "INVALID_CREDENTIALS",
            })
        );
    });

    it("creates one security incident when a source reaches the progressive delay", async () => {
        const user = buildUser();
        mockFindOne.mockResolvedValue(user);
        compare.mockResolvedValue(false);
        recordLoginFailure.mockResolvedValue({
            blocked: true,
            newlyBlocked: true,
            penaltyLevel: 1,
            shouldCreateIncident: true,
        });

        await expect(
            login({
                username: "admin",
                password: "password123",
                req: { headers: {}, ip: "127.0.0.1" },
            })
        ).rejects.toMatchObject({
            code: "INVALID_CREDENTIALS",
        });

        expect(createSecurityIncident).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "LOGIN_FAILURE_THROTTLED",
                phase: "auth",
                context: expect.objectContaining({ penaltyLevel: 1 }),
            })
        );
    });

    it("does not let a throttled source create more audits or extend the delay", async () => {
        const user = buildUser();
        mockFindOne.mockResolvedValue(user);
        getLoginFailureThrottle.mockResolvedValue({
            blocked: true,
            blockedUntil: new Date(Date.now() + 60_000),
        });

        await expect(
            login({
                username: "admin",
                password: "password123",
                req: { headers: {}, ip: "127.0.0.1" },
            })
        ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });

        expect(compare).not.toHaveBeenCalled();
        expect(recordLoginFailure).not.toHaveBeenCalled();
        expect(recordAuthAuditEvent).not.toHaveBeenCalled();
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

    it("identifies a refresh from an evicted session", async () => {
        const user = buildUser({
            activeSessionIds: ["newer-session"],
        });
        findRefreshTokenSession.mockResolvedValue({
            userId: user._id,
            familyId: "family-123",
            sessionId: "evicted-session",
            status: "REVOKED",
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        });
        mockFindById.mockResolvedValue(user);

        await expect(
            refresh({
                refreshToken: "a".repeat(64),
                req: { headers: {}, ip: "127.0.0.1" },
            })
        ).rejects.toMatchObject({
            code: "SESSION_REPLACED",
        });
    });

    it("rotates refresh token when refresh is valid", async () => {
        const user = buildUser({
            refreshTokenHash: "old-hash",
            refreshTokenExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
        });
        findRefreshTokenSession.mockResolvedValue({
            userId: user._id,
            familyId: "family-123",
            sessionId: "session-123",
            status: "ACTIVE",
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        });
        user.activeSessionIds = ["session-123"];
        mockFindById.mockResolvedValue(user);
        rotateActiveRefreshTokenSession.mockResolvedValue({ familyId: "family-123" });
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
        expect(rotateActiveRefreshTokenSession).toHaveBeenCalledTimes(1);
    });

    it("invalidates expired refresh token", async () => {
        const user = buildUser({
            refreshTokenHash: "old-hash",
            refreshTokenExpiresAt: new Date(Date.now() - 1_000),
            authTokenInvalidBefore: null,
            activeSessionIds: ["session-123"],
        });
        findRefreshTokenSession.mockResolvedValue({
            userId: user._id,
            familyId: "family-123",
            sessionId: "session-123",
            status: "ACTIVE",
            expiresAt: new Date(Date.now() - 1_000),
        });
        mockFindById.mockResolvedValue(user);

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

    it("revokes the full family when a rotated refresh token is replayed", async () => {
        const user = buildUser({
            refreshTokenHash: "current-hash",
            refreshTokenExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
            activeSessionIds: ["session-123"],
        });
        findRefreshTokenSession.mockResolvedValue({
            userId: user._id,
            familyId: "family-compromised",
            sessionId: "session-123",
            status: "ROTATED",
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        });
        mockFindById.mockResolvedValue(user);

        await expect(
            refresh({
                refreshToken: "a".repeat(64),
                req: { headers: {}, ip: "127.0.0.1" },
            })
        ).rejects.toMatchObject({ code: "REFRESH_TOKEN_REUSED" });

        expect(revokeRefreshTokenFamily).toHaveBeenCalledWith(
            "family-compromised",
            "REFRESH_TOKEN_REPLAY",
            expect.any(Date)
        );
        expect(user.refreshTokenHash).toBeNull();
        expect(user.authTokenInvalidBefore).toBeInstanceOf(Date);
        expect(recordAuthAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "REFRESH_TOKEN_REPLAY",
                outcome: "FAILED",
                reason: "ROTATED_TOKEN_REUSED",
            })
        );
        expect(createSecurityIncident).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "REFRESH_TOKEN_REPLAY",
                phase: "auth",
                requestPath: "/api/auth/refresh",
            })
        );
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

    it("allows a superadmin to require MFA for a new clinician", async () => {
        mockFindOne.mockResolvedValue(null);
        hash.mockResolvedValue("hashed-password");
        mockCreate.mockResolvedValue({
            _id: "507f1f77bcf86cd799439015",
            username: "newdoctor",
            email: "newdoctor@clinia.local",
            role: "MEDECIN",
            mfaRequired: true,
        });

        const result = await register({
            username: "newdoctor",
            email: "newdoctor@clinia.local",
            password: "password123",
            role: "MEDECIN",
            mfaRequired: true,
            authUser: {
                userId: "507f1f77bcf86cd799439011",
                username: "superadmin",
                role: "SUPERADMIN",
            },
            req: { headers: {}, ip: "127.0.0.1" },
        });

        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({ mfaRequired: true })
        );
        expect(result.user.mfaRequired).toBe(true);
    });

    it("requires MFA and invalidates existing sessions when a superadmin enables it", async () => {
        const user = buildUser({
            role: "MEDECIN",
            mfaRequired: false,
            refreshTokenHash: "existing-refresh-token",
            refreshTokenExpiresAt: new Date(Date.now() + 60_000),
        });
        mockFindById.mockReturnValue({
            select: vi.fn().mockResolvedValue(user),
        });

        const result = await updateUser({
            userId: user._id,
            updates: { mfaRequired: true },
            authUser: {
                userId: "507f1f77bcf86cd799439099",
                username: "superadmin",
                role: "SUPERADMIN",
            },
            req: { headers: {}, ip: "127.0.0.1" },
        });

        expect(user.mfaRequired).toBe(true);
        expect(user.refreshTokenHash).toBeNull();
        expect(user.authTokenInvalidBefore).toBeInstanceOf(Date);
        expect(revokeRefreshTokenFamiliesForUser).toHaveBeenCalledWith(
            user._id,
            "MFA_REQUIRED_ENABLED"
        );
        expect(result.user.mfaRequired).toBe(true);
    });

    it("clears an optional MFA configuration when a superadmin disables it", async () => {
        const user = buildUser({
            role: "MEDECIN",
            mfaRequired: true,
            mfaEnabled: true,
            mfaSecretEncrypted: "encrypted-secret",
            mfaPendingSecretEncrypted: "pending-secret",
            mfaPendingExpiresAt: new Date(Date.now() + 60_000),
            mfaRecoveryCodeHashes: ["recovery-code"],
        });
        mockFindById.mockReturnValue({
            select: vi.fn().mockResolvedValue(user),
        });

        const result = await updateUser({
            userId: user._id,
            updates: { mfaRequired: false },
            authUser: {
                userId: "507f1f77bcf86cd799439099",
                username: "superadmin",
                role: "SUPERADMIN",
            },
            req: { headers: {}, ip: "127.0.0.1" },
        });

        expect(user.mfaRequired).toBe(false);
        expect(user.mfaEnabled).toBe(false);
        expect(user.mfaSecretEncrypted).toBeNull();
        expect(user.mfaPendingSecretEncrypted).toBeNull();
        expect(user.mfaRecoveryCodeHashes).toEqual([]);
        expect(revokeRefreshTokenFamiliesForUser).toHaveBeenCalledWith(
            user._id,
            "MFA_REQUIRED_DISABLED"
        );
        expect(result.user.mfaEnabled).toBe(false);
    });

    it("keeps MFA required for privileged accounts when the environment enforces it", async () => {
        const previousPrivilegedMfaPolicy = process.env.CLINIA_REQUIRE_MFA_FOR_PRIVILEGED;
        process.env.CLINIA_REQUIRE_MFA_FOR_PRIVILEGED = "true";
        const user = buildUser({
            role: "ADMIN",
            mfaRequired: false,
        });
        mockFindById.mockReturnValue({
            select: vi.fn().mockResolvedValue(user),
        });

        try {
            const result = await updateUser({
                userId: user._id,
                updates: { mfaRequired: false },
                authUser: {
                    userId: "507f1f77bcf86cd799439099",
                    username: "superadmin",
                    role: "SUPERADMIN",
                },
                req: { headers: {}, ip: "127.0.0.1" },
            });

            expect(result.user.mfaRequired).toBe(true);
            expect(revokeRefreshTokenFamiliesForUser).toHaveBeenCalledWith(
                user._id,
                "MFA_REQUIRED_ENABLED"
            );
        } finally {
            if (previousPrivilegedMfaPolicy === undefined) {
                delete process.env.CLINIA_REQUIRE_MFA_FOR_PRIVILEGED;
            } else {
                process.env.CLINIA_REQUIRE_MFA_FOR_PRIVILEGED = previousPrivilegedMfaPolicy;
            }
        }
    });

    it("allows a superadmin MFA policy to be disabled in staging", async () => {
        const user = buildUser({
            role: "SUPERADMIN",
            mfaRequired: true,
            mfaEnabled: true,
            mfaSecretEncrypted: "encrypted-secret",
        });
        mockFindById.mockReturnValue({
            select: vi.fn().mockResolvedValue(user),
        });

        const result = await updateUser({
            userId: user._id,
            updates: { mfaRequired: false },
            authUser: {
                userId: "507f1f77bcf86cd799439099",
                username: "superadmin",
                role: "SUPERADMIN",
            },
            req: { headers: {}, ip: "127.0.0.1" },
        });

        expect(result.user.mfaRequired).toBe(false);
        expect(result.user.mfaEnabled).toBe(false);
        expect(user.mfaSecretEncrypted).toBeNull();
    });

    it("self-registers only a USER with email/password", async () => {
        mockFindOne.mockResolvedValue(null);
        hash.mockResolvedValue("hashed-password");
        mockCreate.mockResolvedValue({
            _id: "507f1f77bcf86cd799439099",
            username: "drsmith",
            email: "drsmith@clinia.local",
            role: "USER",
        });

        const result = await registerSelf({
            email: "drsmith@clinia.local",
            password: "password123",
            role: "SUPERADMIN",
            req: { headers: {}, ip: "127.0.0.1" },
        });

        expect(result.user.email).toBe("drsmith@clinia.local");
        expect(result.user.role).toBe("USER");
        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                role: "USER",
            })
        );
        expect(recordAuthAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "REGISTER",
                outcome: "SUCCESS",
                role: "USER",
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
        expect(recordAuthAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "USER_MANAGEMENT",
                actorUsername: "superadmin",
                targetUsername: "admin",
                reason: expect.stringMatching(/^RESET_PASSWORD:/),
            })
        );
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
        expect(recordAuthAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "USER_MANAGEMENT",
                actorUsername: "superadmin",
                targetUsername: "admin",
                reason: expect.stringMatching(/^RESET_PASSWORD:/),
            })
        );
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
        expect(recordAuthAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "PASSWORD_CHANGE",
                actorUsername: "admin",
                targetUsername: "admin",
                reason: "FORCED_PASSWORD_CHANGE_COMPLETED",
            })
        );
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

    it("filters auth logs to password events and exposes actor and target usernames", async () => {
        mockAuthAuditCountDocuments.mockResolvedValue(1);
        mockAuthAuditFind.mockReturnValue({
            sort: vi.fn().mockReturnValue({
                skip: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                        lean: vi.fn().mockResolvedValue([
                            {
                                _id: "507f1f77bcf86cd799439021",
                                action: "USER_MANAGEMENT",
                                outcome: "SUCCESS",
                                userId: "507f1f77bcf86cd799439099",
                                usernameMasked: "su***",
                                actorUsername: "superadmin",
                                targetUsername: "pierrot.lasante",
                                role: "SUPERADMIN",
                                ip: "127.0.0.1",
                                reason: "RESET_PASSWORD:507f1f77bcf86cd799439011",
                                timestamp: new Date("2026-05-17T10:00:00.000Z"),
                            },
                        ]),
                    }),
                }),
            }),
        });

        const result = await listAuthLogs({
            authUser: { role: "SUPERADMIN" },
            passwordEventsOnly: true,
        });

        expect(mockAuthAuditCountDocuments).toHaveBeenCalledWith({
            $and: [
                {
                    $or: [
                        { action: "PASSWORD_CHANGE" },
                        {
                            action: "USER_MANAGEMENT",
                            reason: { $regex: /^RESET_PASSWORD:/ },
                        },
                    ],
                },
            ],
        });
        expect(result.logs).toEqual([
            expect.objectContaining({
                action: "USER_MANAGEMENT",
                actorUsername: "superadmin",
                targetUsername: "pierrot.lasante",
                reason: "RESET_PASSWORD:507f1f77bcf86cd799439011",
            }),
        ]);
    });

    it("builds auth log graph points and preferred action order", async () => {
        mockAuthAuditAggregate.mockResolvedValue([
            { _id: { date: "2026-05-16", action: "FAILED_LOGIN" }, count: 2 },
            { _id: { date: "2026-05-16", action: "LOGIN" }, count: 3 },
            { _id: { date: "2026-05-17", action: "USER_MANAGEMENT" }, count: 1 },
        ]);

        const result = await listAuthLogGraphs({
            authUser: { role: "SUPERADMIN" },
            startDate: "2026-05-16",
            endDate: "2026-05-17",
        });

        expect(mockAuthAuditAggregate).toHaveBeenCalledWith([
            {
                $match: {
                    $and: [
                        {
                            timestamp: {
                                $gte: new Date("2026-05-16T00:00:00.000"),
                                $lte: new Date("2026-05-17T23:59:59.999"),
                            },
                        },
                    ],
                },
            },
            {
                $group: {
                    _id: {
                        date: {
                            $dateToString: {
                                format: "%Y-%m-%d",
                                date: "$timestamp",
                            },
                        },
                        action: "$action",
                    },
                    count: { $sum: 1 },
                },
            },
            { $sort: { "_id.date": 1, "_id.action": 1 } },
        ]);
        expect(result.actions).toEqual(["LOGIN", "FAILED_LOGIN", "USER_MANAGEMENT"]);
        expect(result.points).toEqual([
            { date: "2026-05-16", total: 5, FAILED_LOGIN: 2, LOGIN: 3 },
            { date: "2026-05-17", total: 1, USER_MANAGEMENT: 1 },
        ]);
    });

    it("consumes an MFA challenge after one successful use, regardless of source IP", async () => {
        const user = buildUser({
            mfaEnabled: true,
            mfaRequired: true,
            mfaSecretEncrypted: "encrypted:mfa-secret",
            mfaChallengeId: "challenge-123",
            mfaChallengePurpose: "mfa-login",
            mfaChallengeExpiresAt: new Date(Date.now() + 60_000),
        });
        const select = vi.fn().mockResolvedValue(user);
        mockFindById.mockReturnValue({ select });
        mockFindOneAndUpdate.mockResolvedValue(user);
        verify.mockReturnValue({
            sub: user._id,
            purpose: "mfa-login",
            jti: "challenge-123",
        });
        sign.mockReturnValue("access-token");

        await completeMfaLogin({
            mfaChallenge: "c".repeat(64),
            code: "123456",
            req: { headers: { "x-forwarded-for": "198.51.100.10" }, ip: "10.0.0.2" },
        });

        expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                mfaChallengeId: "challenge-123",
                mfaChallengeAttempts: { $lt: 5 },
            }),
            expect.objectContaining({
                $set: expect.objectContaining({ mfaChallengeId: null }),
            }),
            { new: true }
        );
        expect(user.mfaChallengeId).toBeNull();

        await expect(completeMfaLogin({
            mfaChallenge: "c".repeat(64),
            code: "123456",
            req: { headers: { "x-forwarded-for": "203.0.113.77" }, ip: "10.0.0.2" },
        })).rejects.toMatchObject({ code: "INVALID_MFA_CHALLENGE" });
    });

    it("keeps two sessions and evicts the oldest when a third MFA session is created", async () => {
        const user = buildUser({
            mfaEnabled: true,
            mfaRequired: true,
            mfaSecretEncrypted: "encrypted:mfa-secret",
            mfaChallengeId: "challenge-session-replacement",
            mfaChallengePurpose: "mfa-login",
            mfaChallengeExpiresAt: new Date(Date.now() + 60_000),
            activeSessionIds: ["desktop-session", "phone-session"],
        });
        mockFindById.mockReturnValue({ select: vi.fn().mockResolvedValue(user) });
        mockFindOneAndUpdate.mockResolvedValue(user);
        verify.mockReturnValue({
            sub: user._id,
            purpose: "mfa-login",
            jti: "challenge-session-replacement",
        });
        listActiveRefreshTokenSessionsForUser.mockResolvedValue([
            { sessionId: "desktop-session", createdAt: new Date("2026-07-28T10:00:00.000Z") },
            { sessionId: "phone-session", createdAt: new Date("2026-07-28T10:01:00.000Z") },
        ]);
        sign.mockReturnValue("access-token");

        await completeMfaLogin({
            mfaChallenge: "e".repeat(64),
            code: "123456",
            req: { headers: {}, ip: "127.0.0.1" },
        });

        expect(revokeRefreshTokenSessionForUser).toHaveBeenCalledWith(
            user._id,
            "desktop-session",
            "SESSION_LIMIT_REACHED",
            expect.any(Date)
        );
        expect(user.activeSessionIds).toEqual([
            "phone-session",
            expect.stringMatching(/^[0-9a-f-]{36}$/i),
        ]);
        expect(createSecurityIncident).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "SESSION_LIMIT_REACHED",
                phase: "auth",
                requestPath: "/api/auth/login/mfa",
                context: { userId: user._id, role: user.role },
            })
        );
        expect(recordAuthAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "SESSION_LIMIT_REACHED",
                outcome: "SUCCESS",
            })
        );
    });

    it("invalidates an MFA challenge after five failed attempts across different IPs", async () => {
        const user = buildUser({
            mfaEnabled: true,
            mfaRequired: true,
            mfaSecretEncrypted: "encrypted:mfa-secret",
            mfaChallengeId: "challenge-456",
            mfaChallengePurpose: "mfa-login",
            mfaChallengeExpiresAt: new Date(Date.now() + 60_000),
            mfaChallengeAttempts: 0,
        });
        mockFindById.mockReturnValue({ select: vi.fn().mockResolvedValue(user) });
        verify.mockReturnValue({
            sub: user._id,
            purpose: "mfa-login",
            jti: "challenge-456",
        });
        verifyTotp.mockReturnValue(false);
        mockFindOneAndUpdate.mockImplementation((filter, update) => {
            if (update.$inc) {
                if (user.mfaChallengeAttempts >= filter.mfaChallengeAttempts.$lt) {
                    return Promise.resolve(null);
                }
                user.mfaChallengeAttempts += update.$inc.mfaChallengeAttempts;
                return Promise.resolve(user);
            }

            if (update.$set) {
                if (filter.mfaChallengeAttempts !== user.mfaChallengeAttempts) {
                    return Promise.resolve(null);
                }
                user.mfaChallengeId = update.$set.mfaChallengeId;
                user.mfaChallengePurpose = update.$set.mfaChallengePurpose;
                user.mfaChallengeExpiresAt = update.$set.mfaChallengeExpiresAt;
                user.mfaChallengeAttempts = update.$set.mfaChallengeAttempts;
                user.mfaLockedUntil = update.$set.mfaLockedUntil ?? null;
                return Promise.resolve(user);
            }

            return Promise.resolve(null);
        });

        for (let attempt = 1; attempt <= 4; attempt += 1) {
            await expect(completeMfaLogin({
                mfaChallenge: "d".repeat(64),
                code: "000000",
                req: { headers: { "x-forwarded-for": `198.51.100.${attempt}` }, ip: "10.0.0.2" },
            })).rejects.toMatchObject({ code: "INVALID_MFA_CODE" });
        }

        await expect(completeMfaLogin({
            mfaChallenge: "d".repeat(64),
            code: "000000",
            req: { headers: { "x-forwarded-for": "198.51.100.5" }, ip: "10.0.0.2" },
        })).rejects.toMatchObject({
            code: "MFA_TEMPORARILY_LOCKED",
            mfaLockedUntil: expect.any(String),
        });

        expect(user.mfaChallengeId).toBeNull();
        expect(user.mfaChallengeAttempts).toBe(5);
        expect(user.mfaLockedUntil).toBeInstanceOf(Date);
        expect(recordAuthAuditEvent).toHaveBeenLastCalledWith(
            expect.objectContaining({ reason: "MFA_CHALLENGE_EXHAUSTED" })
        );
        expect(createSecurityIncident).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "MFA_CHALLENGE_EXHAUSTED",
                phase: "auth",
                requestPath: "/api/auth/login/mfa",
                context: {
                    userId: user._id,
                    role: user.role,
                },
            })
        );

        mockFindOne.mockResolvedValue(user);
        compare.mockResolvedValue(true);
        await expect(login({
            email: "admin@example.com",
            password: "password123",
            req: { headers: { "x-forwarded-for": "203.0.113.9" }, ip: "10.0.0.2" },
        })).rejects.toMatchObject({
            code: "MFA_TEMPORARILY_LOCKED",
            mfaLockedUntil: expect.any(String),
        });

        await expect(completeMfaLogin({
            mfaChallenge: "d".repeat(64),
            code: "000000",
            req: { headers: { "x-forwarded-for": "203.0.113.5" }, ip: "10.0.0.2" },
        })).rejects.toMatchObject({ code: "INVALID_MFA_CHALLENGE" });
    });
});
