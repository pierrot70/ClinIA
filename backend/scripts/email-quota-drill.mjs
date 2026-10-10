import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { assertLocalMongo, namespaceModels } from "./reception-auth-load.mjs";

assert.equal(process.env.CLINIA_EMAIL_QUOTA_DRILL, "1");
assert.notEqual(process.env.NODE_ENV, "production");
assert.ok(["mongo-rs-test-backend", "mongo-rs-test-backend-replica"].includes(process.env.CLINIA_INSTANCE_ID));
assertLocalMongo(process.env.MONGO_URI);
mongoose.set("autoCreate", false);
mongoose.set("autoIndex", false);
mongoose.set("bufferCommands", false);
namespaceModels(mongoose, `clinia_auth_load_${randomUUID().replaceAll("-", "")}`);
const { EmailDailyQuota } = await import("../models/EmailDailyQuota.js");
const { reserveEmailAttempt, getEmailQuotaStatus } = await import("../services/emailDailyQuota.js");
let owned = false;
try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    assert.equal(await mongoose.connection.db.listCollections({ name: EmailDailyQuota.collection.name }).hasNext(), false);
    await EmailDailyQuota.createCollection();
    owned = true;
    const day = new Date().toISOString().slice(0, 10);
    await EmailDailyQuota.create({ _id: day, count: 119 });
    await reserveEmailAttempt();
    assert.deepEqual(await getEmailQuotaStatus(), { day, limit: 150, warningThreshold: 120, count: 120, remaining: 30, status: "warning" });
    console.log("PASS QUOTA_WARNING count=120 remaining=30");
    await EmailDailyQuota.updateOne({ _id: day }, { $set: { count: 149 } });
    await EmailDailyQuota.collection.createIndex({ count: 1 }, { unique: true });
    await EmailDailyQuota.create({ _id: "synthetic-conflict", count: 150 });
    await assert.rejects(reserveEmailAttempt(), { code: "EMAIL_QUOTA_UNAVAILABLE" });
    assert.equal((await getEmailQuotaStatus()).status, "unavailable");
    console.log("PASS QUOTA_WRITE_REFUSED status=unavailable");
    await EmailDailyQuota.deleteOne({ _id: "synthetic-conflict" });
    await reserveEmailAttempt();
    assert.equal((await getEmailQuotaStatus()).status, "exhausted");
    await assert.rejects(reserveEmailAttempt(), { code: "EMAIL_DAILY_LIMIT_REACHED" });
    assert.equal((await EmailDailyQuota.findById(day)).count, 150);
    console.log("PASS QUOTA_EXHAUSTED count=150 next_reservation=refused");
} finally {
    if (owned) {
        await mongoose.connection.db.dropCollection(EmailDailyQuota.collection.name);
        assert.equal(await mongoose.connection.db.listCollections({ name: EmailDailyQuota.collection.name }).hasNext(), false);
        console.log("CLEANUP_OK exact synthetic quota collection removed");
    }
    await mongoose.disconnect();
}
