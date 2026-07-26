import { beforeEach, describe, expect, it, vi } from "vitest";

const findOneMock = vi.fn();
const sendPasswordRecoveryCodeMock = vi.fn();
const sendPasswordChangedConfirmationMock = vi.fn();
const recordAuthAuditEventMock = vi.fn();
const revokeRefreshTokenFamiliesForUserMock = vi.fn();

vi.mock("../../models/AdminUser.js", () => ({
    AdminUser: {
        findOne: findOneMock,
    },
}));

vi.mock("../passwordRecoveryEmail.js", () => ({
    sendPasswordRecoveryCode: sendPasswordRecoveryCodeMock,
    sendPasswordChangedConfirmation: sendPasswordChangedConfirmationMock,
}));

vi.mock("../../audit/authAudit.js", () => ({
    recordAuthAuditEvent: recordAuthAuditEventMock,
}));

vi.mock("../auth/refreshTokenFamilies.js", () => ({
    revokeRefreshTokenFamiliesForUser: revokeRefreshTokenFamiliesForUserMock,
}));

describe("password recovery service", () => {
    beforeEach(() => {
        vi.stubEnv("PASSWORD_RECOVERY_SECRET", "test-recovery-secret");
        findOneMock.mockReset();
        sendPasswordRecoveryCodeMock.mockReset().mockResolvedValue(undefined);
        sendPasswordChangedConfirmationMock.mockReset().mockResolvedValue(undefined);
        recordAuthAuditEventMock.mockReset().mockResolvedValue(undefined);
        revokeRefreshTokenFamiliesForUserMock.mockReset().mockResolvedValue(undefined);
    });

    it("stores only a hash and expires the six-digit code after ten minutes", async () => {
        const user = { save: vi.fn().mockResolvedValue(undefined) };
        const selectMock = vi.fn().mockResolvedValue(user);
        findOneMock.mockReturnValue({ select: selectMock });

        const { hashPasswordRecoveryCode, requestPasswordRecoveryCode } =
            await import("../passwordRecovery.js");
        const now = new Date("2026-06-07T13:30:00.000Z");
        const result = await requestPasswordRecoveryCode({
            email: " Doctor@Clinia.Local ",
            now,
        });

        expect(findOneMock).toHaveBeenCalledWith({
            email: "doctor@clinia.local",
            isActive: true,
        });
        const sentCode = sendPasswordRecoveryCodeMock.mock.calls[0][0].code;
        expect(sentCode).toMatch(/^\d{6}$/);
        expect(user.passwordRecoveryCodeHash).toBe(
            hashPasswordRecoveryCode(sentCode)
        );
        expect(user.passwordRecoveryCodeHash).not.toBe(sentCode);
        expect(user.passwordRecoveryCodeExpiresAt).toEqual(
            new Date("2026-06-07T13:40:00.000Z")
        );
        expect(user.passwordRecoveryCodeAttempts).toBe(0);
        expect(user.passwordRecoveryRequestedAt).toEqual(now);
        expect(user.passwordRecoveryGrantHash).toBeNull();
        expect(user.passwordRecoveryGrantExpiresAt).toBeNull();
        expect(sendPasswordRecoveryCodeMock).toHaveBeenCalledWith({
            email: "doctor@clinia.local",
            code: sentCode,
        });
        expect(user.save).toHaveBeenCalledOnce();
    });

    it("returns the same accepted result when the account does not exist", async () => {
        const selectMock = vi.fn().mockResolvedValue(null);
        findOneMock.mockReturnValue({ select: selectMock });

        const { requestPasswordRecoveryCode } =
            await import("../passwordRecovery.js");
        const result = await requestPasswordRecoveryCode({
            email: "unknown@clinia.local",
        });

        expect(result).toEqual({ accepted: true });
    });

    it("clears the active code when email delivery fails", async () => {
        const user = { save: vi.fn().mockResolvedValue(undefined) };
        const selectMock = vi.fn().mockResolvedValue(user);
        findOneMock.mockReturnValue({ select: selectMock });
        sendPasswordRecoveryCodeMock.mockRejectedValue(
            new Error("SMTP unavailable")
        );

        const { requestPasswordRecoveryCode } =
            await import("../passwordRecovery.js");

        await expect(
            requestPasswordRecoveryCode({ email: "doctor@clinia.local" })
        ).resolves.toEqual({
            accepted: true,
            deliveryFailed: true,
        });
        expect(user.passwordRecoveryCodeHash).toBeNull();
        expect(user.passwordRecoveryCodeExpiresAt).toBeNull();
        expect(user.passwordRecoveryCodeAttempts).toBe(0);
        expect(user.save).toHaveBeenCalledTimes(2);
    });

    it("does not query the database when the email is empty", async () => {
        const { requestPasswordRecoveryCode } =
            await import("../passwordRecovery.js");

        await expect(
            requestPasswordRecoveryCode({ email: "" })
        ).resolves.toEqual({ accepted: true });
        expect(findOneMock).not.toHaveBeenCalled();
    });

    it("verifies the correct code once and creates a temporary recovery grant", async () => {
        const {
            hashPasswordRecoveryCode,
            hashPasswordRecoveryGrant,
            verifyPasswordRecoveryCode,
        } = await import("../passwordRecovery.js");
        const user = {
            passwordRecoveryCodeHash: hashPasswordRecoveryCode("123456"),
            passwordRecoveryCodeExpiresAt: new Date("2026-06-07T13:40:00.000Z"),
            passwordRecoveryCodeAttempts: 0,
            save: vi.fn().mockResolvedValue(undefined),
        };
        const selectMock = vi.fn().mockResolvedValue(user);
        findOneMock.mockReturnValue({ select: selectMock });

        const result = await verifyPasswordRecoveryCode({
            email: "doctor@clinia.local",
            code: "123456",
            now: new Date("2026-06-07T13:35:00.000Z"),
        });

        expect(result.verified).toBe(true);
        expect(result.recoveryGrant.length).toBeGreaterThan(30);
        expect(user.passwordRecoveryGrantHash).toBe(
            hashPasswordRecoveryGrant(result.recoveryGrant)
        );
        expect(user.passwordRecoveryGrantHash).not.toBe(result.recoveryGrant);
        expect(user.passwordRecoveryGrantExpiresAt).toEqual(
            new Date("2026-06-07T13:45:00.000Z")
        );
        expect(user.passwordRecoveryCodeHash).toBeNull();
        expect(user.passwordRecoveryCodeExpiresAt).toBeNull();
        expect(user.save).toHaveBeenCalledOnce();
    });

    it("counts a wrong code attempt without revealing account details", async () => {
        const { hashPasswordRecoveryCode, verifyPasswordRecoveryCode } =
            await import("../passwordRecovery.js");
        const user = {
            passwordRecoveryCodeHash: hashPasswordRecoveryCode("123456"),
            passwordRecoveryCodeExpiresAt: new Date("2026-06-07T13:40:00.000Z"),
            passwordRecoveryCodeAttempts: 0,
            save: vi.fn().mockResolvedValue(undefined),
        };
        const selectMock = vi.fn().mockResolvedValue(user);
        findOneMock.mockReturnValue({ select: selectMock });

        await expect(
            verifyPasswordRecoveryCode({
                email: "doctor@clinia.local",
                code: "654321",
                now: new Date("2026-06-07T13:35:00.000Z"),
            })
        ).rejects.toMatchObject({
            code: "INVALID_RECOVERY_CODE",
            message: "Le code est invalide ou expire.",
        });

        expect(user.passwordRecoveryCodeAttempts).toBe(1);
        expect(user.save).toHaveBeenCalledOnce();
    });

    it("rejects an expired code", async () => {
        const { hashPasswordRecoveryCode, verifyPasswordRecoveryCode } =
            await import("../passwordRecovery.js");
        const user = {
            passwordRecoveryCodeHash: hashPasswordRecoveryCode("123456"),
            passwordRecoveryCodeExpiresAt: new Date("2026-06-07T13:30:00.000Z"),
            passwordRecoveryCodeAttempts: 0,
            save: vi.fn(),
        };
        const selectMock = vi.fn().mockResolvedValue(user);
        findOneMock.mockReturnValue({ select: selectMock });

        await expect(
            verifyPasswordRecoveryCode({
                email: "doctor@clinia.local",
                code: "123456",
                now: new Date("2026-06-07T13:35:00.000Z"),
            })
        ).rejects.toMatchObject({ code: "INVALID_RECOVERY_CODE" });
        expect(user.save).not.toHaveBeenCalled();
    });

    it("changes the password with a valid grant and invalidates all sessions", async () => {
        const bcrypt = await import("bcryptjs");
        const hashSpy = vi.spyOn(bcrypt.default, "hash").mockResolvedValue("new-hash");
        const { completePasswordRecovery, hashPasswordRecoveryGrant } =
            await import("../passwordRecovery.js");
        const now = new Date("2026-06-07T13:50:00.000Z");
        const user = {
            passwordRecoveryGrantHash: hashPasswordRecoveryGrant("valid-grant-value-that-is-long-enough"),
            passwordRecoveryGrantExpiresAt: new Date("2026-06-07T13:55:00.000Z"),
            refreshTokenHash: "refresh-hash",
            refreshTokenExpiresAt: new Date("2026-06-07T14:00:00.000Z"),
            sessionStartedAt: new Date("2026-06-07T13:00:00.000Z"),
            lastActivityAt: new Date("2026-06-07T13:45:00.000Z"),
            passwordResetRequired: true,
            mustChangePasswordOnNextLogin: true,
            save: vi.fn().mockResolvedValue(undefined),
        };
        const selectMock = vi.fn().mockResolvedValue(user);
        findOneMock.mockReturnValue({ select: selectMock });

        await expect(
            completePasswordRecovery({
                email: "doctor@clinia.local",
                recoveryGrant: "valid-grant-value-that-is-long-enough",
                newPassword: "NewPassword123!",
                ip: "203.0.113.50",
                now,
            })
        ).resolves.toEqual({ success: true });

        expect(hashSpy).toHaveBeenCalledWith("NewPassword123!", 12);
        expect(user.passwordHash).toBe("new-hash");
        expect(user.refreshTokenHash).toBeNull();
        expect(user.refreshTokenExpiresAt).toBeNull();
        expect(user.sessionStartedAt).toBeNull();
        expect(user.lastActivityAt).toBeNull();
        expect(user.authTokenInvalidBefore).toEqual(now);
        expect(user.passwordRecoveryGrantHash).toBeNull();
        expect(user.passwordRecoveryGrantExpiresAt).toBeNull();
        expect(user.save).toHaveBeenCalledOnce();
        expect(recordAuthAuditEventMock).toHaveBeenCalledWith({
            action: "PASSWORD_CHANGE",
            outcome: "SUCCESS",
            userId: user._id,
            username: user.username,
            actorUsername: user.username,
            targetUsername: user.username,
            role: user.role,
            ip: "203.0.113.50",
            reason: "PASSWORD_RECOVERY_COMPLETED",
        });
        expect(sendPasswordChangedConfirmationMock).toHaveBeenCalledWith({
            email: "doctor@clinia.local",
        });
    });

    it("rejects an invalid recovery grant without changing the password", async () => {
        const { completePasswordRecovery, hashPasswordRecoveryGrant } =
            await import("../passwordRecovery.js");
        const user = {
            passwordRecoveryGrantHash: hashPasswordRecoveryGrant("valid-grant-value-that-is-long-enough"),
            passwordRecoveryGrantExpiresAt: new Date("2026-06-07T13:55:00.000Z"),
            save: vi.fn(),
        };
        const selectMock = vi.fn().mockResolvedValue(user);
        findOneMock.mockReturnValue({ select: selectMock });

        await expect(
            completePasswordRecovery({
                email: "doctor@clinia.local",
                recoveryGrant: "wrong-grant-value-that-is-long-enough",
                newPassword: "NewPassword123!",
                now: new Date("2026-06-07T13:50:00.000Z"),
            })
        ).rejects.toMatchObject({ code: "INVALID_PASSWORD_RECOVERY" });
        expect(user.save).not.toHaveBeenCalled();
    });
});
