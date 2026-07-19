import { describe, expect, it } from "vitest";
import { getIsSecureRequest } from "../sessionCookies.js";

describe("getIsSecureRequest", () => {
    it("uses Express secure state instead of accepting a spoofed forwarded header", () => {
        expect(
            getIsSecureRequest({
                secure: false,
                headers: { "x-forwarded-proto": "https" },
            })
        ).toBe(false);
    });

    it("accepts HTTPS after Express has validated the trusted proxy", () => {
        expect(getIsSecureRequest({ secure: true, headers: {} })).toBe(true);
    });
});
