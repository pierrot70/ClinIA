import { afterEach, describe, expect, it } from "vitest";

import {
    createMfaSecret,
    createTotp,
    decryptMfaSecret,
    encryptMfaSecret,
    verifyTotp,
    matchTotpStep,
} from "../mfa.js";

const originalKey = process.env.MFA_ENCRYPTION_KEY;

afterEach(() => {
    if (originalKey === undefined) delete process.env.MFA_ENCRYPTION_KEY;
    else process.env.MFA_ENCRYPTION_KEY = originalKey;
});

describe("MFA TOTP", () => {
    it("returns the matched step throughout the permitted clock-skew window", () => {
        const secret = "JBSWY3DPEHPK3PXP";
        const now = 1_800_000_000_000;
        for (const offset of [-1, 0, 1]) {
            const timestamp = now + offset * 30_000;
            expect(matchTotpStep(secret, createTotp(secret, timestamp), now)).toBe(timestamp / 30_000);
        }
        expect(matchTotpStep(secret, createTotp(secret, now - 60_000), now)).toBeNull();
        expect(matchTotpStep(secret, "12345", now)).toBeNull();
        expect(matchTotpStep(secret, "abcdef", now)).toBeNull();
    });
    it("encrypts the secret at rest and accepts only the current authenticator code", () => {
        process.env.MFA_ENCRYPTION_KEY = "test-mfa-encryption-key-that-is-long-enough";
        const secret = createMfaSecret();
        const encrypted = encryptMfaSecret(secret);

        expect(secret).toMatch(/^[A-Z2-7]{32}$/);
        expect(encrypted).not.toContain(secret);
        expect(decryptMfaSecret(encrypted)).toBe(secret);

        const now = Date.now();
        const acceptedCode = createTotp(secret, now);
        expect(acceptedCode).toMatch(/^\d{6}$/);
        expect(verifyTotp(secret, acceptedCode, now)).toBe(true);
        expect(verifyTotp(secret, "000000", now)).toBe(acceptedCode === "000000");
    });
});
