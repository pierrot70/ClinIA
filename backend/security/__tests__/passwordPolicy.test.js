import { describe, expect, it } from "vitest";

import {
    getPasswordPolicyViolation,
    isPasswordAllowed,
} from "../passwordPolicy.js";

describe("password policy", () => {
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
