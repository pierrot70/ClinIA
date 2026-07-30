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

    it("uses Cloudflare's canonical client IP only through the configured proxy and a Cloudflare relay", () => {
        const request = {
            ip: "172.64.10.20",
            headers: {
                "cf-connecting-ip": "198.51.100.42",
                "x-forwarded-for": "198.51.100.42, 172.64.10.20",
            },
            socket: { remoteAddress: "10.0.2.9" },
        };

        expect(getTrustedRequestIp(request, {
            CLINIA_TRUST_PROXY_CIDRS: "10.0.2.0/24",
        })).toBe("198.51.100.42");
    });

    it("rejects a forged Cloudflare header when the forwarding chain does not end at Cloudflare", () => {
        const request = {
            ip: "198.51.100.99",
            headers: {
                "cf-connecting-ip": "198.51.100.42",
                "x-forwarded-for": "198.51.100.99",
            },
            socket: { remoteAddress: "10.0.2.9" },
        };

        expect(getTrustedRequestIp(request, {
            CLINIA_TRUST_PROXY_CIDRS: "10.0.2.0/24",
        })).toBe("198.51.100.99");
    });

    it("rejects a Cloudflare header from a peer outside the configured proxy CIDR", () => {
        const request = {
            ip: "198.51.100.99",
            headers: {
                "cf-connecting-ip": "198.51.100.42",
                "x-forwarded-for": "198.51.100.42, 172.64.10.20",
            },
            socket: { remoteAddress: "203.0.113.10" },
        };

        expect(getTrustedRequestIp(request, {
            CLINIA_TRUST_PROXY_CIDRS: "10.0.2.0/24",
        })).toBe("198.51.100.99");
    });
});
