import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { EmailDailyQuota } from "../models/EmailDailyQuota.js";
import { reserveEmailAttempt } from "../services/emailDailyQuota.js";
import { sendPasswordRecoveryCode, sendPasswordChangedConfirmation } from "../services/passwordRecoveryEmail.js";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail, close() {} }) } }));
let ownsDatabase = false;
let uri;
const connectionOptions = { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 10000 };

beforeAll(async () => {
    uri = process.env.CLINIA_WALKIN_TEST_URI || "";
    if (process.env.NODE_ENV !== "test" || !/^mongodb:\/\/127\.0\.0\.1:\d+\/clinia_walkin_integration\?directConnection=true&replicaSet=walkin_test$/.test(uri)) {
        throw new Error("Use the disposable integration runner --email-quota.");
    }
    await mongoose.connect(uri, connectionOptions);
    expect((await mongoose.connection.db.admin().command({ hello: 1 })).setName).toBe("walkin_test");
    expect(await mongoose.connection.db.listCollections().toArray()).toHaveLength(0);
    ownsDatabase = true;
    await EmailDailyQuota.createCollection();
});
beforeEach(async () => {
    await EmailDailyQuota.deleteMany({});
    sendMail.mockReset().mockResolvedValue({});
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2099-01-15T12:00:00Z"));
    vi.stubEnv("SMTP_HOST", "unused.example.invalid");
    vi.stubEnv("SMTP_PORT", "2525");
    vi.stubEnv("PASSWORD_RECOVERY_ENABLED", "true");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
afterAll(async () => {
    if (ownsDatabase && mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
});

it("permits exactly 150 concurrent reservations, retaining the cap after reconnect", async () => {
    const results = await Promise.allSettled(Array.from({ length: 220 }, () => reserveEmailAttempt()));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(150);
    expect(results.filter(r => r.status === "rejected").every(r => r.reason.code === "EMAIL_DAILY_LIMIT_REACHED")).toBe(true);
    await mongoose.disconnect();
    await mongoose.connect(uri, connectionOptions);
    await expect(reserveEmailAttempt()).rejects.toMatchObject({ code: "EMAIL_DAILY_LIMIT_REACHED" });
    expect((await EmailDailyQuota.findById("2099-01-15")).count).toBe(150);
});

it("opens a separate budget at UTC midnight without resetting the previous day", async () => {
    await EmailDailyQuota.create({ _id: "2099-01-15", count: 150 });
    vi.setSystemTime(new Date("2099-01-15T23:59:59.999Z"));
    await expect(reserveEmailAttempt()).rejects.toMatchObject({ code: "EMAIL_DAILY_LIMIT_REACHED" });
    vi.setSystemTime(new Date("2099-01-16T00:00:00.000Z"));
    await reserveEmailAttempt();
    expect((await EmailDailyQuota.findById("2099-01-15")).count).toBe(150);
    expect((await EmailDailyQuota.findById("2099-01-16")).count).toBe(1);
});

it("shares the last slot between both message types and retains failed SMTP attempts", async () => {
    await EmailDailyQuota.create({ _id: "2099-01-15", count: 149 });
    sendMail.mockRejectedValue(new Error("synthetic SMTP failure"));
    await expect(sendPasswordRecoveryCode({ email: "synthetic@example.invalid", code: "123456" })).rejects.toThrow("synthetic SMTP failure");
    await expect(sendPasswordChangedConfirmation({ email: "synthetic@example.invalid" })).rejects.toMatchObject({ code: "EMAIL_DAILY_LIMIT_REACHED" });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect((await EmailDailyQuota.findById("2099-01-15")).count).toBe(150);
});
