import mongoose from "mongoose";

const RateLimitWindowSchema = new mongoose.Schema(
    {
        limiterKey: {
            type: String,
            required: true,
            index: true,
        },
        actorKey: {
            type: String,
            required: true,
            index: true,
        },
        windowStartedAt: {
            type: Date,
            required: true,
            index: true,
        },
        windowMs: {
            type: Number,
            required: true,
        },
        requestCount: {
            type: Number,
            default: 0,
        },
        expiresAt: {
            type: Date,
            required: true,
            index: { expires: 0 },
        },
    },
    { timestamps: true }
);

RateLimitWindowSchema.index(
    { limiterKey: 1, actorKey: 1, windowStartedAt: 1 },
    { unique: true }
);

export const RateLimitWindow =
    mongoose.models.RateLimitWindow ||
    mongoose.model("RateLimitWindow", RateLimitWindowSchema);
