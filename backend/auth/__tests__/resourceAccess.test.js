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

    it("keeps global clinical access restricted to superadmins", () => {
        expect(
            buildOwnerScope({
                userId: "507f1f77bcf86cd799439011",
                role: "SUPERADMIN",
            })
        ).toEqual({});
        expect(isPrivilegedUser({ role: "SUPERADMIN" })).toBe(true);
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
