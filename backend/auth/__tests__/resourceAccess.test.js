import { describe, expect, it } from "vitest";
import {
    buildOwnerScope,
    isPrivilegedUser,
} from "../resourceAccess.js";

describe("resource access", () => {
    it("scopes ordinary users to their own records", () => {
        expect(
            buildOwnerScope({
                userId: "507f1f77bcf86cd799439011",
                role: "MEDECIN",
            })
        ).toEqual({
            ownerUserId: "507f1f77bcf86cd799439011",
        });
    });

    it("keeps operational admins scoped to their own records", () => {
        expect(
            buildOwnerScope({
                userId: "507f1f77bcf86cd799439011",
                role: "ADMIN",
            })
        ).toEqual({
            ownerUserId: "507f1f77bcf86cd799439011",
        });
        expect(isPrivilegedUser({ role: "ADMIN" })).toBe(false);
    });

    it("denies superadmins clinical access by default", () => {
        expect(() =>
            buildOwnerScope({
                userId: "507f1f77bcf86cd799439011",
                role: "SUPERADMIN",
            })
        ).toThrow();

        try {
            buildOwnerScope({
                userId: "507f1f77bcf86cd799439011",
                role: "SUPERADMIN",
            });
        } catch (error) {
            expect(error).toEqual({
                code: "CLINICAL_ACCESS_REQUIRED",
                message:
                    "Une autorisation clinique déléguée en lecture est requise.",
            });
        }
        expect(isPrivilegedUser({ role: "SUPERADMIN" })).toBe(false);
    });

    it("fails closed when authentication context is absent", () => {
        let error;
        try {
            buildOwnerScope();
        } catch (caught) {
            error = caught;
        }

        expect(error).toEqual({
            code: "UNAUTHORIZED",
            message: "Authentification requise.",
        });
    });
});
