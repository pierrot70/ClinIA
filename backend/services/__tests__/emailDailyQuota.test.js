import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EmailDailyQuota } from "../../models/EmailDailyQuota.js";
import { EMAIL_DAILY_LIMIT, EMAIL_DAILY_WARNING_THRESHOLD, getEmailQuotaStatus, reserveEmailAttempt } from "../emailDailyQuota.js";

vi.mock("../../models/EmailDailyQuota.js", () => ({
    EmailDailyQuota: { updateOne: vi.fn(), findOneAndUpdate: vi.fn(), findById: vi.fn() },
}));
beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(EmailDailyQuota.findById).mockReturnValue({ maxTimeMS: () => ({ lean: async () => null }) });
    vi.mocked(EmailDailyQuota.updateOne).mockReset().mockResolvedValue({});
    vi.mocked(EmailDailyQuota.findOneAndUpdate).mockReset().mockResolvedValue({ count: 1 });
});
afterEach(() => vi.restoreAllMocks());

it("fails closed when initialization fails", async () => {
    vi.mocked(EmailDailyQuota.updateOne).mockRejectedValue(new Error("database unavailable"));
    await expect(reserveEmailAttempt()).rejects.toMatchObject({ code: "EMAIL_QUOTA_UNAVAILABLE" });
    expect(EmailDailyQuota.findOneAndUpdate).not.toHaveBeenCalled();
});
it("fails closed without retrying an ambiguous reservation", async () => {
    vi.mocked(EmailDailyQuota.findOneAndUpdate).mockRejectedValue(new Error("write timeout"));
    await expect(reserveEmailAttempt()).rejects.toMatchObject({ code: "EMAIL_QUOTA_UNAVAILABLE" });
    expect(EmailDailyQuota.findOneAndUpdate).toHaveBeenCalledTimes(1);
});
it("tolerates a concurrent unique document creation", async () => {
    vi.mocked(EmailDailyQuota.updateOne).mockRejectedValue({ code: 11000 });
    await expect(reserveEmailAttempt()).resolves.toBeUndefined();
});
it("rejects a depleted quota", async () => {
    vi.mocked(EmailDailyQuota.findOneAndUpdate).mockResolvedValue(null);
    await expect(reserveEmailAttempt()).rejects.toMatchObject({ code: "EMAIL_DAILY_LIMIT_REACHED" });
});

it("alerts only at shared reservation milestones", async () => {
    for (const count of [119, 120, 121, 149, 150]) {
        vi.mocked(EmailDailyQuota.findOneAndUpdate).mockResolvedValue({ count });
        await reserveEmailAttempt();
    }
    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(JSON.parse(console.warn.mock.calls[0][1])).toEqual({
        event: "EMAIL_QUOTA_APPROACHING_LIMIT", day: new Date().toISOString().slice(0, 10),
        limit: EMAIL_DAILY_LIMIT, count: EMAIL_DAILY_WARNING_THRESHOLD,
    });
    expect(JSON.parse(console.warn.mock.calls[1][1])).toMatchObject({
        event: "EMAIL_DAILY_LIMIT_REACHED", count: EMAIL_DAILY_LIMIT,
    });
});

it("reports Mongo failure without logging raw errors or claiming a reservation count", async () => {
    const sensitiveError = "mongodb://secret:password@host/patient@example.invalid";
    vi.mocked(EmailDailyQuota.findOneAndUpdate).mockRejectedValue(new Error(sensitiveError));
    await expect(reserveEmailAttempt()).rejects.toMatchObject({ code: "EMAIL_QUOTA_UNAVAILABLE" });
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error.mock.calls[0][0]).toBe("CLINIA_EMAIL_QUOTA");
    expect(JSON.parse(console.error.mock.calls[0][1])).toEqual({
        event: "EMAIL_QUOTA_UNAVAILABLE", day: new Date().toISOString().slice(0, 10), limit: EMAIL_DAILY_LIMIT,
    });
    expect(JSON.stringify(console.error.mock.calls)).not.toContain(sensitiveError);
});

it("reports a refusal when a previous backend consumed the final reservation", async () => {
    vi.mocked(EmailDailyQuota.findOneAndUpdate).mockResolvedValue(null);
    await expect(reserveEmailAttempt()).rejects.toMatchObject({ code: "EMAIL_DAILY_LIMIT_REACHED" });
    expect(JSON.parse(console.warn.mock.calls[0][1])).toMatchObject({ event: "EMAIL_DAILY_LIMIT_REACHED" });
    expect(console.error).not.toHaveBeenCalled();
});

it.each([[0, "ok", 150], [119, "ok", 31], [120, "warning", 30], [150, "exhausted", 0]])(
    "reports the shared daily quota at %i without making a reservation", async (count, status, remaining) => {
        await reserveEmailAttempt(); // clear a previous local failure
        vi.mocked(EmailDailyQuota.findById).mockReturnValue({ maxTimeMS: () => ({ lean: async () => ({ count }) }) });
        vi.mocked(EmailDailyQuota.updateOne).mockClear();
        vi.mocked(EmailDailyQuota.findOneAndUpdate).mockClear();
        expect(await getEmailQuotaStatus()).toMatchObject({ count, status, remaining, limit: 150, warningThreshold: 120 });
        expect(EmailDailyQuota.updateOne).not.toHaveBeenCalled();
        expect(EmailDailyQuota.findOneAndUpdate).not.toHaveBeenCalled();
    });
it("reports unknown quota when Mongo cannot be read", async () => {
    vi.mocked(EmailDailyQuota.findById).mockReturnValue({ maxTimeMS: () => ({ lean: async () => { throw new Error("secret database details"); } }) });
    expect(await getEmailQuotaStatus()).toMatchObject({ status: "unavailable", count: null, remaining: null });
});
it("keeps a failed reservation visible even when reads work, until reservations recover", async () => {
    vi.mocked(EmailDailyQuota.findOneAndUpdate).mockRejectedValue(new Error("write refused"));
    await expect(reserveEmailAttempt()).rejects.toMatchObject({ code: "EMAIL_QUOTA_UNAVAILABLE" });
    expect(await getEmailQuotaStatus()).toMatchObject({ status: "unavailable" });
    vi.mocked(EmailDailyQuota.findOneAndUpdate).mockResolvedValue({ count: 1 });
    await reserveEmailAttempt();
    expect(await getEmailQuotaStatus()).toMatchObject({ status: "ok" });
});
it("does not report corrupted counters as healthy", async () => {
    vi.mocked(EmailDailyQuota.findById).mockReturnValue({ maxTimeMS: () => ({ lean: async () => ({ count: -1 }) }) });
    expect(await getEmailQuotaStatus()).toMatchObject({ status: "unavailable", count: null });
});
