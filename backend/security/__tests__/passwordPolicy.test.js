import { describe, expect, it } from "vitest";

import {
    getPasswordPolicyViolation,
    isPasswordAllowed,
} from "../passwordPolicy.js";

describe("password policy", () => {
    it.each([
        ["a".repeat(72), "a".repeat(73)],
        ["é".repeat(36), "é".repeat(36) + "a"],
        ["😀".repeat(18), "😀".repeat(18) + "a"],
        ["e\u0301".repeat(24), "e\u0301".repeat(24) + "a"],
    ])("accepts exactly 72 UTF-8 bytes and rejects an additional byte", (allowed, refused) => {
        expect(Buffer.byteLength(allowed, "utf8")).toBe(72);
        expect(isPasswordAllowed(allowed)).toBe(true);
        expect(getPasswordPolicyViolation(refused)).toContain("72 octets");
    });
    it("accepts a long passphrase without arbitrary character-class rules", () => {
        expect(isPasswordAllowed("cobalt meadow lantern river")).toBe(true);
    });

    it("rejects passwords shorter than twelve characters", () => {
        expect(getPasswordPolicyViolation("password123")).toMatch(/12 caracteres/);
    });

    it("rejects known compromised passwords even when they meet the minimum length", () => {
        expect(getPasswordPolicyViolation("passwordpassword")).toMatch(/courant ou compromis/);
    });
});
