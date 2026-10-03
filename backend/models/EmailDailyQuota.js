import mongoose from "mongoose";

// One shared counter per UTC day. No recipient, user or message data.
const schema = new mongoose.Schema({
    _id: { type: String, required: true },
    count: { type: Number, required: true, min: 0 },
}, { versionKey: false, bufferCommands: false });

export const EmailDailyQuota = mongoose.model("EmailDailyQuota", schema);
