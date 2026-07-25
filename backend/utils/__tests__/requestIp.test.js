import { describe, expect, it } from "vitest";

import { getTrustedRequestIp } from "../requestIp.js";

describe("getTrustedRequestIp", () => {
    it("uses Express's resolved IP and ignores client-controlled forwarding headers", () => {
        const request = {
            ip: "203.0.113.60",
            headers: {
                "cf-connecting-ip": "198.51.100.10",
                "x-forwarded-for": "198.51.100.11, 10.0.0.8",
            },
            socket: { remoteAddress: "10.0.0.8" },
        };

        expect(getTrustedRequestIp(request)).toBe("203.0.113.60");
    });

    it("falls back to the direct socket address only when Express has no IP", () => {
        expect(
            getTrustedRequestIp({
                headers: { "x-forwarded-for": "198.51.100.12" },
                socket: { remoteAddress: "127.0.0.1" },
            })
        ).toBe("127.0.0.1");
    });
});
