import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

const mocks = vi.hoisted(() => ({
    findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn(),
    transaction: vi.fn(), sendCode: vi.fn(), sendConfirmation: vi.fn(),
    audit: vi.fn(), revoke: vi.fn(), logSafeError: vi.fn(),
}));
vi.mock("../../models/AdminUser.js", () => ({ AdminUser: {
    findOne: mocks.findOne, findOneAndUpdate: mocks.findOneAndUpdate,
    updateOne: mocks.updateOne, db: { transaction: mocks.transaction },
} }));
vi.mock("../passwordRecoveryEmail.js", () => ({
    sendPasswordRecoveryCode: mocks.sendCode,
    sendPasswordChangedConfirmation: mocks.sendConfirmation,
}));
vi.mock("../../audit/authAudit.js", () => ({ recordAuthAuditEvent: mocks.audit }));
vi.mock("../auth/refreshTokenFamilies.js", () => ({ revokeRefreshTokenFamiliesForUser: mocks.revoke }));
vi.mock("../../utils/requestLogSafety.js", () => ({ logSafeError: mocks.logSafeError }));

import {
    requestPasswordRecoveryCode, verifyPasswordRecoveryCode, completePasswordRecovery,
    hashPasswordRecoveryCode, hashPasswordRecoveryGrant,
} from "../passwordRecovery.js";

const now = new Date("2026-06-07T13:35:00.000Z");
const session = { id: "test-session" };
const email = "doctor@clinia.local";
const recoveryGrant = "valid-grant-value-that-is-long-enough";
const completionInput = { email, recoveryGrant, newPassword: "NewPassword123!", now };
const invalidCode = { code: "INVALID_RECOVERY_CODE", message: "Le code est invalide ou expire." };
const invalidGrant = { code: "INVALID_PASSWORD_RECOVERY" };
function lookup(user) {
    mocks.findOne.mockReturnValue({ select: vi.fn().mockResolvedValue(user) });
}
function codeUser(overrides = {}) {
    return { _id: "user-id", passwordRecoveryRequestId: "request-id",
        passwordRecoveryCodeHash: hashPasswordRecoveryCode("123456"),
        passwordRecoveryCodeExpiresAt: new Date("2026-06-07T13:40:00.000Z"),
        passwordRecoveryCodeAttempts: 0, ...overrides };
}
function grantUser(overrides = {}) {
    return { _id: "user-id", username: "doctor", role: "MEDECIN", passwordHash: "old-hash",
        passwordRecoveryGrantHash: hashPasswordRecoveryGrant(recoveryGrant),
        passwordRecoveryGrantExpiresAt: new Date("2026-06-07T13:40:00.000Z"), ...overrides };
}
function expectNoCompletionSideEffects() {
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.sendConfirmation).not.toHaveBeenCalled();
}

describe("password recovery service", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.resetAllMocks();
        vi.stubEnv("PASSWORD_RECOVERY_SECRET", "test-recovery-secret");
        mocks.findOneAndUpdate.mockResolvedValue({ _id: "user-id", username: "doctor", role: "MEDECIN" });
        mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
        mocks.transaction.mockImplementation(async (callback) => callback(session));
        mocks.sendCode.mockResolvedValue(undefined);
        mocks.sendConfirmation.mockResolvedValue(undefined);
        mocks.audit.mockResolvedValue(undefined);
        mocks.revoke.mockResolvedValue(undefined);
        vi.spyOn(bcrypt, "hash").mockResolvedValue("new-hash");
    });

    it("stores only the code hash, with ten minute expiry, without revoking sessions", async () => {
        await expect(requestPasswordRecoveryCode({ email: " Doctor@Clinia.Local ", now }))
            .resolves.toEqual({ accepted: true });
        const { code } = mocks.sendCode.mock.calls[0][0];
        expect(code).toMatch(/^\d{6}$/);
        const [filter, update] = mocks.findOneAndUpdate.mock.calls[0];
        expect(filter).toEqual({ email, isActive: true });
        expect(update).toEqual({ $set: {
            passwordRecoveryCodeHash: hashPasswordRecoveryCode(code),
            passwordRecoveryCodeExpiresAt: new Date("2026-06-07T13:45:00.000Z"),
            passwordRecoveryCodeAttempts: 0, passwordRecoveryRequestedAt: now,
            passwordRecoveryRequestId: expect.any(String),
            passwordRecoveryGrantHash: null, passwordRecoveryGrantExpiresAt: null,
        } });
        expect(update.$set.passwordRecoveryCodeHash).not.toBe(code);
        expect(mocks.sendCode).toHaveBeenCalledWith({ email, code });
        expect(mocks.revoke).not.toHaveBeenCalled();
        expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it("returns the same accepted result for an absent or inactive account without email", async () => {
        mocks.findOneAndUpdate.mockResolvedValue(null);
        await expect(requestPasswordRecoveryCode({ email, now })).resolves.toEqual({ accepted: true });
        expect(mocks.sendCode).not.toHaveBeenCalled();
    });

    it("scopes failed delivery cleanup to the exact request without clearing a newer grant", async () => {
        mocks.sendCode.mockRejectedValue(new Error("SMTP unavailable"));
        // A later request or verification already replaced this request.
        mocks.updateOne.mockResolvedValue({ modifiedCount: 0 });
        await expect(requestPasswordRecoveryCode({ email, now }))
            .resolves.toEqual({ accepted: true, deliveryFailed: true });
        const { passwordRecoveryRequestId, passwordRecoveryCodeHash } = mocks.findOneAndUpdate.mock.calls[0][1].$set;
        expect(mocks.updateOne).toHaveBeenCalledWith(
            { _id: "user-id", passwordRecoveryRequestId, passwordRecoveryCodeHash },
            { $set: { passwordRecoveryCodeHash: null, passwordRecoveryCodeExpiresAt: null,
                passwordRecoveryCodeAttempts: 0, passwordRecoveryRequestId: null } }, expect.any(Object));
        expect(mocks.updateOne).toHaveBeenCalledOnce();
        expect(mocks.revoke).not.toHaveBeenCalled();
    });

    it("does not send a code if storing it fails", async () => {
        const failure = new Error("database unavailable");
        mocks.findOneAndUpdate.mockRejectedValue(failure);
        await expect(requestPasswordRecoveryCode({ email, now })).rejects.toBe(failure);
        expect(mocks.sendCode).not.toHaveBeenCalled();
    });

    it("does not query the database for an empty email", async () => {
        await expect(requestPasswordRecoveryCode({ email: "" })).resolves.toEqual({ accepted: true });
        expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
        expect(mocks.findOne).not.toHaveBeenCalled();
    });

    it("issues a hashed temporary grant only after atomically consuming the current code", async () => {
        const user = codeUser();
        lookup(user);
        const result = await verifyPasswordRecoveryCode({ email, code: "123456", now });
        expect(result.verified).toBe(true);
        expect(result.recoveryGrant.length).toBeGreaterThan(30);
        expect(mocks.findOneAndUpdate).toHaveBeenCalledWith({
            _id: user._id, isActive: true, passwordRecoveryRequestId: "request-id",
            passwordRecoveryCodeHash: user.passwordRecoveryCodeHash,
            passwordRecoveryCodeExpiresAt: { $gt: now }, passwordRecoveryCodeAttempts: { $lt: 5 },
        }, { $set: {
            passwordRecoveryGrantHash: hashPasswordRecoveryGrant(result.recoveryGrant),
            passwordRecoveryGrantExpiresAt: new Date("2026-06-07T13:45:00.000Z"),
            passwordRecoveryCodeHash: null, passwordRecoveryCodeExpiresAt: null,
            passwordRecoveryCodeAttempts: 0, passwordRecoveryRequestId: null,
        } }, expect.any(Object));
        expect(mocks.revoke).not.toHaveBeenCalled();
    });

    it("rejects a code when another request wins its conditional update", async () => {
        lookup(codeUser());
        mocks.findOneAndUpdate.mockResolvedValue(null);
        await expect(verifyPasswordRecoveryCode({ email, code: "123456", now })).rejects.toMatchObject(invalidCode);
        expectNoCompletionSideEffects();
        expect(mocks.revoke).not.toHaveBeenCalled();
    });

    it("counts a wrong code atomically with the request identity and attempt ceiling", async () => {
        const user = codeUser();
        lookup(user);
        await expect(verifyPasswordRecoveryCode({ email, code: "654321", now })).rejects.toMatchObject(invalidCode);
        expect(mocks.updateOne).toHaveBeenCalledWith(expect.objectContaining({
            _id: user._id, passwordRecoveryRequestId: "request-id",
            passwordRecoveryCodeHash: user.passwordRecoveryCodeHash,
            passwordRecoveryCodeAttempts: { $lt: 5 }, passwordRecoveryCodeExpiresAt: { $gt: now },
        }), { $inc: { passwordRecoveryCodeAttempts: 1 } }, expect.any(Object));
        expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it.each([
        ["absent", null],
        ["expired", { passwordRecoveryCodeExpiresAt: now }],
        ["exhausted", { passwordRecoveryCodeAttempts: 5 }],
        ["consumed", { passwordRecoveryCodeHash: null }],
    ])("rejects an %s code without mutating state", async (_, overrides) => {
        lookup(overrides === null ? null : codeUser(overrides));
        await expect(verifyPasswordRecoveryCode({ email, code: "123456", now })).rejects.toMatchObject(invalidCode);
        expect(mocks.updateOne).not.toHaveBeenCalled();
        expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it.each(["", "12345", "1234567", "abcdef"])("rejects malformed code %j before lookup", async (code) => {
        await expect(verifyPasswordRecoveryCode({ email, code, now })).rejects.toMatchObject(invalidCode);
        expect(mocks.findOne).not.toHaveBeenCalled();
    });

    it("commits password, grant consumption and session revocation before notification", async () => {
        const user = grantUser();
        lookup(user);
        await expect(completePasswordRecovery({ ...completionInput, ip: "203.0.113.50" }))
            .resolves.toEqual({ success: true });
        expect(bcrypt.hash).toHaveBeenCalledWith("NewPassword123!", 12);
        expect(mocks.findOneAndUpdate).toHaveBeenCalledWith({
            _id: user._id, isActive: true, passwordHash: "old-hash",
            passwordRecoveryGrantHash: user.passwordRecoveryGrantHash,
            passwordRecoveryGrantExpiresAt: { $gt: now },
        }, expect.objectContaining({ $inc: { authVersion: 1 }, $set: expect.objectContaining({
            passwordHash: "new-hash", refreshTokenHash: null, refreshTokenExpiresAt: null,
            activeSessionId: null, activeSessionIds: [], sessionStartedAt: null, lastActivityAt: null,
            authTokenInvalidBefore: now, passwordRecoveryGrantHash: null, passwordRecoveryGrantExpiresAt: null,
            passwordRecoveryRequestId: null, passwordResetRequired: false, mustChangePasswordOnNextLogin: false,
            mfaChallengeId: null, mfaPendingSecretEncrypted: null,
        }) }), { session, returnDocument: "after" });
        expect(mocks.revoke).toHaveBeenCalledWith(user._id, "PASSWORD_RECOVERY_COMPLETED", now, { session });
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
            action: "PASSWORD_CHANGE", outcome: "SUCCESS", userId: user._id, ip: "203.0.113.50",
            reason: "PASSWORD_RECOVERY_COMPLETED",
        }));
        expect(mocks.sendConfirmation).toHaveBeenCalledWith({ email });
        expect(mocks.revoke.mock.invocationCallOrder[0]).toBeLessThan(mocks.audit.mock.invocationCallOrder[0]);
    });

    it("does not revoke or notify when another request already consumed the grant", async () => {
        lookup(grantUser());
        mocks.findOneAndUpdate.mockResolvedValue(null);
        await expect(completePasswordRecovery(completionInput)).rejects.toMatchObject(invalidGrant);
        expect(mocks.revoke).not.toHaveBeenCalled();
        expectNoCompletionSideEffects();
    });

    it("does not notify when refresh family revocation aborts the transaction", async () => {
        lookup(grantUser());
        const failure = new Error("revocation failed");
        mocks.revoke.mockRejectedValue(failure);
        await expect(completePasswordRecovery(completionInput)).rejects.toBe(failure);
        expect(mocks.revoke).toHaveBeenCalledWith("user-id", "PASSWORD_RECOVERY_COMPLETED", now, { session });
        expectNoCompletionSideEffects();
    });

    it("does not notify if committing the transaction fails after its callback", async () => {
        lookup(grantUser());
        const failure = new Error("commit failed");
        mocks.transaction.mockImplementation(async (callback) => {
            await callback(session);
            throw failure;
        });
        await expect(completePasswordRecovery(completionInput)).rejects.toBe(failure);
        expectNoCompletionSideEffects();
    });

    it("keeps a committed password change successful when confirmation delivery fails", async () => {
        lookup(grantUser());
        mocks.sendConfirmation.mockRejectedValue(new Error("SMTP unavailable"));
        await expect(completePasswordRecovery(completionInput)).resolves.toEqual({ success: true });
        expect(mocks.transaction).toHaveBeenCalledOnce();
        expect(mocks.logSafeError).toHaveBeenCalledWith("PASSWORD_CHANGE_CONFIRMATION_DELIVERY_FAILED",
            expect.any(Error), { component: "email" });
    });

    it.each([
        ["absent", null],
        ["expired", { passwordRecoveryGrantExpiresAt: now }],
        ["consumed", { passwordRecoveryGrantHash: null }],
        ["incorrect", { passwordRecoveryGrantHash: "00".repeat(32) }],
    ])("rejects an %s grant without changing the password", async (_, overrides) => {
        lookup(overrides === null ? null : grantUser(overrides));
        await expect(completePasswordRecovery(completionInput)).rejects.toMatchObject(invalidGrant);
        expect(bcrypt.hash).not.toHaveBeenCalled();
        expect(mocks.transaction).not.toHaveBeenCalled();
        expectNoCompletionSideEffects();
    });

    it.each([
        { newPassword: "passwordpassword" }, { recoveryGrant: "short" }, { email: "" },
    ])("rejects invalid input before looking up a grant: %j", async (overrides) => {
        await expect(completePasswordRecovery({ ...completionInput, ...overrides })).rejects.toMatchObject(invalidGrant);
        expect(mocks.findOne).not.toHaveBeenCalled();
        expect(mocks.transaction).not.toHaveBeenCalled();
    });
});
