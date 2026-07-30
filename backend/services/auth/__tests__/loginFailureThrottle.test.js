import { describe, expect, it } from "vitest";

import {
    getLoginFailureThrottle,
    hashLoginFailureIp,
    LOGIN_FAILURE_DELAYS_MS,
    LOGIN_FAILURE_MAX_ATTEMPTS,
    recordLoginFailure,
} from "../loginFailureThrottle.js";

function createModel() {
    const records = new Map();
    const keyFor = ({ userId, ipHash }) => `${userId}:${ipHash}`;

    return {
        async findOne(query) {
            return records.get(keyFor(query)) || null;
        },
        async findOneAndUpdate(query, update) {
            const key = keyFor(query);
            const next = { ...(records.get(key) || {}), ...update.$set };
            records.set(key, next);
            return next;
        },
        async deleteOne(query) {
            records.delete(keyFor(query));
        },
    };
}

describe("login failure throttle", () => {
    it("applies a progressive delay only to the same account and trusted source", async () => {
        const model = createModel();
        const userId = "user-1";
        const sourceIp = "10.0.2.17";
        const now = new Date("2026-07-30T12:00:00.000Z");

        for (let attempt = 1; attempt < LOGIN_FAILURE_MAX_ATTEMPTS; attempt += 1) {
            const result = await recordLoginFailure({ userId, ip: sourceIp, now, LoginFailureThrottleModel: model });
            expect(result.blocked).toBe(false);
        }

        const locked = await recordLoginFailure({ userId, ip: sourceIp, now, LoginFailureThrottleModel: model });
        expect(locked).toMatchObject({ blocked: true, newlyBlocked: true, penaltyLevel: 1, shouldCreateIncident: true });
        expect(locked.blockedUntil).toEqual(new Date(now.getTime() + LOGIN_FAILURE_DELAYS_MS[0]));

        const otherSource = await getLoginFailureThrottle({ userId, ip: "10.0.2.18", now, LoginFailureThrottleModel: model });
        expect(otherSource.blocked).toBe(false);
    });

    it("does not extend a cooldown or emit another incident when a blocked source keeps retrying", async () => {
        const model = createModel();
        const userId = "user-1";
        const ip = "10.0.2.17";
        const now = new Date("2026-07-30T12:00:00.000Z");

        for (let attempt = 0; attempt < LOGIN_FAILURE_MAX_ATTEMPTS; attempt += 1) {
            await recordLoginFailure({ userId, ip, now, LoginFailureThrottleModel: model });
        }

        const repeated = await recordLoginFailure({
            userId,
            ip,
            now: new Date(now.getTime() + 30_000),
            LoginFailureThrottleModel: model,
        });
        expect(repeated).toMatchObject({ blocked: true, newlyBlocked: false, shouldCreateIncident: false });
        expect(repeated.blockedUntil).toEqual(new Date(now.getTime() + LOGIN_FAILURE_DELAYS_MS[0]));
    });

    it("uses a new, longer delay after the first cooldown expires", async () => {
        const model = createModel();
        const userId = "user-1";
        const ip = "10.0.2.17";
        const firstWindow = new Date("2026-07-30T12:00:00.000Z");

        for (let attempt = 0; attempt < LOGIN_FAILURE_MAX_ATTEMPTS; attempt += 1) {
            await recordLoginFailure({ userId, ip, now: firstWindow, LoginFailureThrottleModel: model });
        }

        const secondWindow = new Date(firstWindow.getTime() + LOGIN_FAILURE_DELAYS_MS[0] + 1);
        for (let attempt = 1; attempt < LOGIN_FAILURE_MAX_ATTEMPTS; attempt += 1) {
            await recordLoginFailure({ userId, ip, now: secondWindow, LoginFailureThrottleModel: model });
        }
        const lockedAgain = await recordLoginFailure({ userId, ip, now: secondWindow, LoginFailureThrottleModel: model });

        expect(lockedAgain).toMatchObject({ penaltyLevel: 2, shouldCreateIncident: true });
        expect(lockedAgain.blockedUntil).toEqual(new Date(secondWindow.getTime() + LOGIN_FAILURE_DELAYS_MS[1]));
        expect(hashLoginFailureIp(ip)).not.toContain(ip);
    });
});
