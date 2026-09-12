import { describe, expect, it, vi } from "vitest";
import { createReauthRateLimiter, REAUTH_WINDOW_MS } from "../reauthRateLimiter.js";

const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() });
const request = (userId = "user-1") => ({ auth: { userId }, body: { password: "synthetic-secret", userId: "forged" } });
function model() {
    const counts = new Map();
    return { findOneAndUpdate: vi.fn(async query => {
        const key = JSON.stringify(query);
        const count = (counts.get(key) || 0) + 1;
        counts.set(key, count);
        return { requestCount: count };
    }) };
}
describe("reauthentication limit", () => {
    it("allows five attempts and blocks the sixth before password verification", async () => {
        const db = model(), limiter = createReauthRateLimiter({ RateLimitWindowModel: db, now: () => 1000 });
        const next = vi.fn();
        for (let i = 0; i < 5; i++) await limiter(request(), response(), next);
        const res = response();
        await limiter(request(), res, next);
        expect(next).toHaveBeenCalledTimes(5);
        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.json).toHaveBeenCalledWith({ error: expect.objectContaining({ code: "REAUTH_RATE_LIMITED" }) });
        expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "899");
        expect(JSON.stringify(db.findOneAndUpdate.mock.calls)).not.toContain("synthetic-secret");
        expect(db.findOneAndUpdate.mock.calls[0][0].actorKey).toBe("user:user-1");
        expect(db.findOneAndUpdate.mock.calls[0][2]).toMatchObject({ upsert: true, returnDocument: "after", writeConcern: { w: "majority" } });
    });
    it("shares the account limit between instances and concurrent requests despite changing IP/session/body", async () => {
        const db = model();
        const instances = [0, 1].map(() => createReauthRateLimiter({ RateLimitWindowModel: db, now: () => 1000 }));
        const next = vi.fn(), responses = Array.from({ length: 12 }, response);
        await Promise.all(responses.map((res, i) => instances[i % 2]({ ...request(), ip: `192.0.2.${i}`, auth: { userId: "user-1", sessionId: `session-${i}` } }, res, next)));
        expect(next).toHaveBeenCalledTimes(5);
        expect(responses.filter(res => res.status.mock.calls[0]?.[0] === 429)).toHaveLength(7);
        const other = vi.fn();
        await instances[0](request("user-2"), response(), other);
        expect(other).toHaveBeenCalledTimes(1);
    });
    it("starts a new fixed window without waiting for TTL cleanup", async () => {
        let time = REAUTH_WINDOW_MS - 1;
        const limiter = createReauthRateLimiter({ RateLimitWindowModel: model(), now: () => time });
        for (let i = 0; i < 5; i++) await limiter(request(), response(), vi.fn());
        const res = response();
        await limiter(request(), res, vi.fn());
        expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "1");
        time++;
        const next = vi.fn();
        await limiter(request(), response(), next);
        expect(next).toHaveBeenCalledTimes(1);
    });
    it("refuses an unauthenticated request without touching Mongo", async () => {
        const db = model(), next = vi.fn(), res = response();
        await createReauthRateLimiter({ RateLimitWindowModel: db })({ body: { userId: "forged" } }, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(db.findOneAndUpdate).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });
    it.each([null, {}, { requestCount: NaN }, { requestCount: 0 }])("fails closed on invalid counter %j", async bucket => {
        const res = response(), next = vi.fn();
        await createReauthRateLimiter({ RateLimitWindowModel: { findOneAndUpdate: async () => bucket } })(request(), res, next);
        expect(res.status).toHaveBeenCalledWith(503);
        expect(next).not.toHaveBeenCalled();
    });
    it("fails closed on Mongo errors without exposing database details", async () => {
        const res = response(), next = vi.fn();
        await createReauthRateLimiter({ RateLimitWindowModel: { findOneAndUpdate: async () => { throw new Error("PRIVATE_DATABASE_DETAIL"); } } })(request(), res, next);
        expect(res.status).toHaveBeenCalledWith(503);
        expect(next).not.toHaveBeenCalled();
        expect(JSON.stringify(res.json.mock.calls)).not.toContain("PRIVATE_DATABASE_DETAIL");
    });
});
