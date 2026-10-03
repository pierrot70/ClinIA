// Regression tests: real MongoDB and authentication; synthetic identities only.
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { sendPasswordRecoveryCode, sendPasswordChangedConfirmation } from "../services/passwordRecoveryEmail.js";
import { AdminUser } from "../models/AdminUser.js";
import { RefreshTokenSession } from "../models/RefreshTokenSession.js";
import { completePasswordRecovery, requestPasswordRecoveryCode, verifyPasswordRecoveryCode, hashPasswordRecoveryCode, hashPasswordRecoveryGrant } from "../services/passwordRecovery.js";
import { login, refresh, completeMfaLogin } from "../services/auth.js";
import { hashRecoveryCode } from "../services/auth/mfa.js";
import { isTokenFromInactiveSession } from "../auth/sessionAccess.js";
import { verifyJWT } from "../middleware/verifyJWT.js";

vi.mock("../services/passwordRecoveryEmail.js", () => ({
    sendPasswordRecoveryCode: vi.fn().mockResolvedValue(undefined),
    sendPasswordChangedConfirmation: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../audit/authAudit.js", () => ({ recordAuthAuditEvent: vi.fn().mockResolvedValue(undefined) }));
let ownsDatabase = false;
let user;
const email = "synthetic@example.invalid";
const grant = "synthetic-grant-for-local-review-only-0123456789";
const newPassword = "Synthetic-long-passphrase-2026!";

function barrier(count) {
    let arrived = 0;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    return async () => { if (++arrived === count) release(); await gate; };
}
function synchronizeRecoveryReads(count) {
    const original = AdminUser.findOne.bind(AdminUser);
    const wait = barrier(count);
    vi.spyOn(AdminUser, "findOne").mockImplementation((...args) => ({
        select: async fields => { const doc = await original(...args).select(fields); await wait(); return doc; },
    }));
}
beforeAll(async () => {
    const uri = process.env.CLINIA_WALKIN_TEST_URI || "";
    if (process.env.NODE_ENV !== "test" || !/^mongodb:\/\/127\.0\.0\.1:\d+\/clinia_walkin_integration\?directConnection=true&replicaSet=walkin_test$/.test(uri)) {
        throw new Error("Disposable local runner --recovery-security required");
    }
    await mongoose.connect(uri, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 10000 });
    expect((await mongoose.connection.db.admin().command({ hello: 1 })).setName).toBe("walkin_test");
    expect(await mongoose.connection.db.listCollections().toArray()).toHaveLength(0);
    ownsDatabase = true;
    for (const model of Object.values(mongoose.models)) { await model.createCollection(); await model.createIndexes(); }
});
beforeEach(async () => {
    vi.mocked(sendPasswordRecoveryCode).mockReset().mockResolvedValue(undefined);
    vi.mocked(sendPasswordChangedConfirmation).mockReset().mockResolvedValue(undefined);
    vi.stubEnv("PASSWORD_RECOVERY_SECRET", "synthetic-local-review-secret");
    vi.stubEnv("JWT_ACCESS_SECRET", "synthetic-local-access-secret");
    vi.stubEnv("JWT_REFRESH_SECRET", "synthetic-local-refresh-secret");
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    user = await AdminUser.create({
        username: "synthetic-review", email, role: "USER", isActive: true,
        passwordHash: await bcrypt.hash("Original-synthetic-password!", 4),
        activeSessionIds: ["old-session"], activeSessionId: "old-session",
        sessionStartedAt: new Date(), lastActivityAt: new Date(),
        passwordRecoveryCodeHash: hashPasswordRecoveryCode("123456"),
        passwordRecoveryCodeExpiresAt: new Date(Date.now() + 600000),
        passwordRecoveryGrantHash: hashPasswordRecoveryGrant(grant),
        passwordRecoveryGrantExpiresAt: new Date(Date.now() + 600000),
    });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
afterAll(async () => {
    if (ownsDatabase && mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
});

it("allows only one completion for a recovery grant", async () => {
    synchronizeRecoveryReads(2);
    const results = await Promise.allSettled(Array.from({ length: 2 }, () => completePasswordRecovery({ email, recoveryGrant: grant, newPassword })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")[0].reason.code).toBe("INVALID_PASSWORD_RECOVERY");
    expect(sendPasswordChangedConfirmation).toHaveBeenCalledTimes(1);
});
it("issues only one grant for simultaneous verification of the same code", async () => {
    synchronizeRecoveryReads(2);
    const results = await Promise.allSettled([verifyPasswordRecoveryCode({ email, code: "123456" }), verifyPasswordRecoveryCode({ email, code: "123456" })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")[0].reason.code).toBe("INVALID_RECOVERY_CODE");
});
it("caps concurrent wrong-code attempts at five and exhausts the code", async () => {
    synchronizeRecoveryReads(8);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => verifyPasswordRecoveryCode({ email, code: "654321" })));
    expect(results.every(r => r.status === "rejected" && r.reason.code === "INVALID_RECOVERY_CODE")).toBe(true);
    expect((await AdminUser.findById(user._id).select("+passwordRecoveryCodeAttempts")).passwordRecoveryCodeAttempts).toBe(5);
    vi.restoreAllMocks();
    await expect(verifyPasswordRecoveryCode({email, code: "123456"})).rejects.toMatchObject({code: "INVALID_RECOVERY_CODE"});
});
it("keeps refresh families active while merely requesting a code", async () => {
    await RefreshTokenSession.create({ userId: user._id, familyId: "synthetic-family", sessionId: "old-session", tokenHash: "synthetic-hash", expiresAt: new Date(Date.now() + 600000) });
    await requestPasswordRecoveryCode({ email });
    expect((await RefreshTokenSession.findOne({ userId: user._id })).status).toBe("ACTIVE");
});
it("rejects an old JWT permanently after reset and a new login", async () => {
    const oldToken = jwt.sign({ role: "USER", sid: "old-session" }, process.env.JWT_ACCESS_SECRET, {
        subject: String(user._id), issuer: "clinia-backend", audience: "clinia-app", expiresIn: "15m", algorithm: "HS256",
    });
    const request = () => ({ headers: { authorization: `Bearer ${oldToken}` }, originalUrl: "/api/auth/session", method: "GET" });
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    const next = vi.fn();
    // Legacy JWTs remain valid until this account performs a recovery.
    await verifyJWT(request(), res, next);
    expect(next).toHaveBeenCalledOnce();
    next.mockClear();
    await completePasswordRecovery({ email, recoveryGrant: grant, newPassword });
    const resetUser = await AdminUser.findById(user._id);
    expect(resetUser.authTokenInvalidBefore).toBeTruthy();
    expect(resetUser.activeSessionIds).toEqual([]);
    expect(resetUser.activeSessionId).toBeNull();
    expect(resetUser.authVersion).toBe(1);
    await verifyJWT(request(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    const session = await login({ username: "synthetic-review", password: newPassword, req: { ip: "127.0.0.1", headers: {} } });
    const loggedInUser = await AdminUser.findById(user._id);
    expect(loggedInUser.authTokenInvalidBefore).toBeNull();
    expect(isTokenFromInactiveSession(loggedInUser, { sid: "old-session" })).toBe(true);
    await verifyJWT(request(), res, next);
    expect(next).not.toHaveBeenCalled();
    await verifyJWT({ ...request(), headers: {authorization: `Bearer ${session.accessToken}`} }, res, next);
    expect(next).toHaveBeenCalledOnce();
    await expect(refresh({ refreshToken: session.refreshToken, req: {ip: "127.0.0.1", headers: {}} })).resolves.toHaveProperty("accessToken");
});

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}
const req = { ip: "127.0.0.1", headers: {} };
async function seedRefresh() {
    const token = crypto.randomBytes(48).toString("hex");
    await RefreshTokenSession.create({ userId: user._id, familyId: "old-family", sessionId: "old-session",
        authVersion: 0, tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 600000) });
    return token;
}

it("rejects an old refresh token both before and after a new login", async () => {
    const token = await seedRefresh();
    await completePasswordRecovery({ email, recoveryGrant: grant, newPassword });
    expect((await RefreshTokenSession.findOne({userId: user._id})).status).toBe("REVOKED");
    await expect(refresh({ refreshToken: token, req })).rejects.toBeDefined();
    await login({username: user.username, password: newPassword, req});
    await expect(refresh({ refreshToken: token, req })).rejects.toBeDefined();
});

it("rolls back password, grant and generation if refresh revocation fails", async () => {
    await seedRefresh();
    vi.spyOn(RefreshTokenSession, "updateMany").mockRejectedValueOnce(new Error("synthetic write failure"));
    await expect(completePasswordRecovery({ email, recoveryGrant: grant, newPassword })).rejects.toThrow("synthetic write failure");
    const unchanged = await AdminUser.findById(user._id).select("+passwordRecoveryGrantHash");
    expect(unchanged.passwordHash).toBe(user.passwordHash);
    expect(unchanged.authVersion ?? 0).toBe(0);
    expect(unchanged.passwordRecoveryGrantHash).toBe(hashPasswordRecoveryGrant(grant));
    expect(unchanged.activeSessionIds).toEqual(["old-session"]);
    expect((await RefreshTokenSession.findOne({userId: user._id})).status).toBe("ACTIVE");
    expect(sendPasswordChangedConfirmation).not.toHaveBeenCalled();
});

it("does not let a delayed SMTP failure clear a newer request with the same code", async () => {
    const entered = deferred(); const release = deferred();
    vi.spyOn(crypto, "randomInt").mockReturnValue(123456);
    vi.mocked(sendPasswordRecoveryCode).mockImplementationOnce(async () => {
        entered.resolve(); await release.promise; throw new Error("synthetic SMTP failure");
    });
    const first = requestPasswordRecoveryCode({ email });
    await entered.promise;
    try {
        await requestPasswordRecoveryCode({ email });
    } finally { release.resolve(); }
    await expect(first).resolves.toMatchObject({ accepted: true, deliveryFailed: true });
    await expect(verifyPasswordRecoveryCode({ email, code: "123456" })).resolves.toMatchObject({ verified: true });
});

it("refuses a login suspended before a concurrent password recovery commits", async () => {
    const entered = deferred(); const release = deferred();
    const original = bcrypt.compare.bind(bcrypt);
    vi.spyOn(bcrypt, "compare").mockImplementationOnce(async (...args) => {
        const match = await original(...args); entered.resolve(); await release.promise; return match;
    });
    const pending = login({ username: user.username, password: "Original-synthetic-password!", req });
    const outcome = Promise.allSettled([pending]);
    await entered.promise;
    try { await completePasswordRecovery({ email, recoveryGrant: grant, newPassword }); }
    finally { release.resolve(); }
    expect((await outcome)[0]).toMatchObject({status: "rejected", reason: {code: "SESSION_REPLACED"}});
    expect((await AdminUser.findById(user._id)).activeSessionIds).toEqual([]);
    expect(await RefreshTokenSession.countDocuments({userId: user._id, status: "ACTIVE"})).toBe(0);
});

it("refuses a refresh whose new family member is created after password recovery", async () => {
    const token = await seedRefresh();
    const entered = deferred(); const release = deferred();
    const original = RefreshTokenSession.create.bind(RefreshTokenSession);
    vi.spyOn(RefreshTokenSession, "create").mockImplementationOnce(async (...args) => {
        entered.resolve(); await release.promise; return original(...args);
    });
    const outcome = Promise.allSettled([refresh({refreshToken: token, req})]);
    await entered.promise;
    try { await completePasswordRecovery({ email, recoveryGrant: grant, newPassword }); }
    finally { release.resolve(); }
    expect((await outcome)[0]).toMatchObject({status: "rejected", reason: {code: "SESSION_REPLACED"}});
    await login({username: user.username, password: newPassword, req});
    expect((await AdminUser.findById(user._id)).activeSessionIds).not.toContain("old-session");
});

it("keeps generation durable even if a stale document restores an old session id", async () => {
    const stale = await AdminUser.findById(user._id);
    const token = await seedRefresh();
    await completePasswordRecovery({ email, recoveryGrant: grant, newPassword });
    stale.activeSessionIds = ["old-session", "stale-session"];
    await stale.save();
    // Simulate an orphan ACTIVE token written late by another backend.
    await RefreshTokenSession.updateOne({userId: user._id}, {$set: {status: "ACTIVE"}});
    await login({username: user.username, password: newPassword, req});
    const current = await AdminUser.findById(user._id);
    expect(current.authVersion).toBe(1);
    expect(isTokenFromInactiveSession(current, {sid: "old-session", av: 0})).toBe(true);
    await expect(refresh({refreshToken: token, req})).rejects.toMatchObject({code: "INVALID_REFRESH_TOKEN"});
});

it("invalidates a pre-reset MFA challenge while keeping enrolled MFA enabled", async () => {
    const jti = "synthetic-challenge";
    const challenge = jwt.sign({purpose: "mfa-login", role: "USER", av: 0}, process.env.JWT_ACCESS_SECRET, {
        subject: String(user._id), jwtid: jti, issuer: "clinia-backend", audience: "clinia-mfa", expiresIn: "5m",
    });
    await AdminUser.updateOne({_id: user._id}, {$set: {mfaEnabled: true, mfaSecretEncrypted: "synthetic-preserved-secret",
        mfaChallengeId: jti, mfaChallengePurpose: "mfa-login", mfaChallengeExpiresAt: new Date(Date.now() + 300000)}});
    await completePasswordRecovery({email, recoveryGrant: grant, newPassword});
    const current = await AdminUser.findById(user._id).select("+mfaSecretEncrypted +mfaChallengeId");
    expect(current.mfaEnabled).toBe(true);
    expect(current.mfaSecretEncrypted).toBe("synthetic-preserved-secret");
    expect(current.mfaChallengeId).toBeNull();
    await expect(completeMfaLogin({mfaChallenge: challenge, code: "123456", req})).rejects.toMatchObject({code: "INVALID_MFA_CHALLENGE"});
    // Even a late write of the old challenge cannot defeat the new generation.
    await AdminUser.updateOne({_id: user._id}, {$set: {mfaChallengeId: jti, mfaChallengePurpose: "mfa-login", mfaChallengeExpiresAt: new Date(Date.now() + 300000)}});
    await expect(completeMfaLogin({mfaChallenge: challenge, code: "123456", req})).rejects.toMatchObject({code: "INVALID_MFA_CHALLENGE"});
});

it("rejects a grant that expires while hashing the new password", async () => {
    const startedAt = new Date();
    vi.useFakeTimers({toFake: ["Date"]});
    vi.setSystemTime(startedAt);
    const original = bcrypt.hash.bind(bcrypt);
    vi.spyOn(bcrypt, "hash").mockImplementationOnce(async (...args) => {
        const hash = await original(...args);
        vi.setSystemTime(new Date(startedAt.getTime() + 660000));
        return hash;
    });
    await expect(completePasswordRecovery({email, recoveryGrant: grant, newPassword}))
        .rejects.toMatchObject({code: "INVALID_PASSWORD_RECOVERY"});
    const current = await AdminUser.findById(user._id);
    expect(current.passwordHash).toBe(user.passwordHash);
    expect(current.authVersion).toBeUndefined();
    expect(sendPasswordChangedConfirmation).not.toHaveBeenCalled();
});

it("rejects a code that expires during its database read", async () => {
    const startedAt = new Date();
    vi.useFakeTimers({toFake: ["Date"]});
    vi.setSystemTime(startedAt);
    const original = AdminUser.findOne.bind(AdminUser);
    vi.spyOn(AdminUser, "findOne").mockImplementationOnce((...args) => ({
        select: async fields => {
            const doc = await original(...args).select(fields);
            vi.setSystemTime(new Date(startedAt.getTime() + 660000));
            return doc;
        },
    }));
    await expect(verifyPasswordRecoveryCode({email, code: "123456"}))
        .rejects.toMatchObject({code: "INVALID_RECOVERY_CODE"});
});

it("refuses an MFA write suspended after challenge consumption across recovery", async () => {
    const code = "synthetic-recovery-code";
    const jti = "synthetic-mfa-race";
    const challenge = jwt.sign({purpose: "mfa-login", role: "USER", av: 0}, process.env.JWT_ACCESS_SECRET, {
        subject: String(user._id), jwtid: jti, issuer: "clinia-backend", audience: "clinia-mfa", expiresIn: "5m",
    });
    await AdminUser.updateOne({_id: user._id}, {$set: {
        mfaEnabled: true, mfaSecretEncrypted: "synthetic-preserved-secret",
        mfaRecoveryCodeHashes: [hashRecoveryCode(code)], mfaChallengeId: jti,
        mfaChallengePurpose: "mfa-login", mfaChallengeExpiresAt: new Date(Date.now() + 300000),
    }});
    const entered = deferred(); const release = deferred();
    const original = AdminUser.prototype.save;
    vi.spyOn(AdminUser.prototype, "save").mockImplementationOnce(async function (...args) {
        entered.resolve(); await release.promise; return original.apply(this, args);
    });
    const outcome = Promise.allSettled([completeMfaLogin({mfaChallenge: challenge, code, req})]);
    await entered.promise;
    try { await completePasswordRecovery({email, recoveryGrant: grant, newPassword}); }
    finally { release.resolve(); }
    expect((await outcome)[0]).toMatchObject({status: "rejected", reason: {code: "SESSION_REPLACED"}});
    const current = await AdminUser.findById(user._id).select("+mfaRecoveryCodeHashes");
    expect(current.mfaRecoveryCodeHashes).toEqual([hashRecoveryCode(code)]);
    expect(current.mfaEnabled).toBe(true);
});
