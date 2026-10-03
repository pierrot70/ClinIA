import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EmailDailyQuota } from "../../models/EmailDailyQuota.js";
import { reserveEmailAttempt } from "../emailDailyQuota.js";

vi.mock("../../models/EmailDailyQuota.js", () => ({
    EmailDailyQuota: { updateOne: vi.fn(), findOneAndUpdate: vi.fn() },
}));
beforeEach(() => {
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
