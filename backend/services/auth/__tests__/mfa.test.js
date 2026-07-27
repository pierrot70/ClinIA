import { afterEach, describe, expect, it } from "vitest";

import {
    createMfaSecret,
    createTotp,
    decryptMfaSecret,
    encryptMfaSecret,
    verifyTotp,
} from "../mfa.js";

const originalKey = process.env.MFA_ENCRYPTION_KEY;

afterEach(() => {
    if (originalKey === undefined) delete process.env.MFA_ENCRYPTION_KEY;
    else process.env.MFA_ENCRYPTION_KEY = originalKey;
});

describe("MFA TOTP", () => {
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
