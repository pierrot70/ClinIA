import { EmailDailyQuota } from "../models/EmailDailyQuota.js";

// Deliberately not configurable via environment or request input.
export const EMAIL_DAILY_LIMIT = 150;
const writeOptions = { writeConcern: { w: "majority", j: true, wtimeout: 5000 } };

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
        throw Object.assign(new Error("Email quota unavailable"), { code: "EMAIL_QUOTA_UNAVAILABLE" });
    }
    if (!reserved) {
        throw Object.assign(new Error("Daily email limit reached"), { code: "EMAIL_DAILY_LIMIT_REACHED" });
    }
    // Reservations are intentionally retained even if SMTP fails afterwards.
}
