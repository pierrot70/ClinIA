import { describe, expect, it } from "vitest";
import { resolveAnalyzeExecutionMode } from "../aiAnalyzeAccessService.js";

describe("ai analyze access service", () => {
    it("forces anonymous requests to mock even when forceReal is supplied", () => {
        expect(
            resolveAnalyzeExecutionMode({
                authUser: undefined,
                forceMock: false,
                mockEnabled: false,
                forceReal: true,
            })
        ).toEqual({
            authenticated: false,
            forceRealSafe: false,
            useMock: true,
        });
    });

    it("allows an authenticated user to request real analysis", () => {
        expect(
            resolveAnalyzeExecutionMode({
                authUser: { userId: "user-1", role: "USER" },
                forceMock: false,
                mockEnabled: false,
                forceReal: true,
            })
        ).toEqual({
            authenticated: true,
            forceRealSafe: true,
            useMock: false,
        });
    });

    it("keeps server-enforced mock mode authoritative", () => {
        expect(
            resolveAnalyzeExecutionMode({
                authUser: { userId: "user-1", role: "SUPERADMIN" },
                forceMock: true,
                mockEnabled: false,
                forceReal: true,
            })
        ).toEqual({
            authenticated: true,
            forceRealSafe: false,
            useMock: true,
        });
    });
});
