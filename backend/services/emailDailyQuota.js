import { EmailDailyQuota } from "../models/EmailDailyQuota.js";

// Deliberately not configurable via environment or request input.
export const EMAIL_DAILY_LIMIT = 150;
export const EMAIL_DAILY_WARNING_THRESHOLD = 120;
let reservationFailureDay = null;
const writeOptions = { writeConcern: { w: "majority", j: true, wtimeout: 5000 } };

function reportQuotaEvent(event, day, count) {
    // Fixed operational fields only: never include errors or message/recipient data.
    const details = { event, day, limit: EMAIL_DAILY_LIMIT };
    if (count !== undefined) details.count = count;
    const writer = event === "EMAIL_QUOTA_UNAVAILABLE" ? console.error : console.warn;
    writer("CLINIA_EMAIL_QUOTA", JSON.stringify(details));
}

export async function reserveEmailAttempt() {
    const day = new Date().toISOString().slice(0, 10);
    let reserved;
    try {
        try {
            await EmailDailyQuota.updateOne(
                { _id: day },
                { $setOnInsert: { count: 0 } },
                { ...writeOptions, upsert: true },
            );
        } catch (error) {
            // A concurrent instance may have created today's unique document.
            if (error?.code !== 11000) throw error;
        }
        reserved = await EmailDailyQuota.findOneAndUpdate(
            { _id: day, count: { $lt: EMAIL_DAILY_LIMIT } },
            { $inc: { count: 1 } },
            { ...writeOptions, returnDocument: "after" },
        );
    } catch {
        // A write timeout can have consumed a slot. Never refund or send anyway.
        reservationFailureDay = day;
        reportQuotaEvent("EMAIL_QUOTA_UNAVAILABLE", day);
        throw Object.assign(new Error("Email quota unavailable"), { code: "EMAIL_QUOTA_UNAVAILABLE" });
    }
    reservationFailureDay = null;
    if (!reserved) {
        reportQuotaEvent("EMAIL_DAILY_LIMIT_REACHED", day);
        throw Object.assign(new Error("Daily email limit reached"), { code: "EMAIL_DAILY_LIMIT_REACHED" });
    }
    // Atomic post-increment count emits each milestone once across all backends.
    if (reserved.count === EMAIL_DAILY_WARNING_THRESHOLD) {
        reportQuotaEvent("EMAIL_QUOTA_APPROACHING_LIMIT", day, reserved.count);
    } else if (reserved.count === EMAIL_DAILY_LIMIT) {
        reportQuotaEvent("EMAIL_DAILY_LIMIT_REACHED", day, reserved.count);
    }
    // Reservations are intentionally retained even if SMTP fails afterwards.
}

// Read-only operational view. Never touches the shared quota or message data.
export async function getEmailQuotaStatus() {
    const day = new Date().toISOString().slice(0, 10);
    const unavailable = { day, limit: EMAIL_DAILY_LIMIT, warningThreshold: EMAIL_DAILY_WARNING_THRESHOLD,
        count: null, remaining: null, status: "unavailable" };
    try {
        const quota = await EmailDailyQuota.findById(day).maxTimeMS(3000).lean();
        const count = quota?.count ?? (quota ? NaN : 0);
        if (!Number.isInteger(count) || count < 0 || reservationFailureDay === day) return unavailable;
        return { day, limit: EMAIL_DAILY_LIMIT, warningThreshold: EMAIL_DAILY_WARNING_THRESHOLD,
            count, remaining: Math.max(0, EMAIL_DAILY_LIMIT - count),
            status: count >= EMAIL_DAILY_LIMIT ? "exhausted" : count >= EMAIL_DAILY_WARNING_THRESHOLD ? "warning" : "ok" };
    } catch {
        return unavailable;
    }
}
