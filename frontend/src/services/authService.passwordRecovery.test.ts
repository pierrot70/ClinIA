import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    completePasswordRecovery,
    isPasswordRecoveryAvailable,
    requestPasswordRecovery,
    verifyPasswordRecoveryCode,
} from "./authService";

describe("password recovery auth service", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("requests, verifies, and completes password recovery", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({ data: { accepted: true } }),
                    { status: 202 }
                )
            )
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        data: {
                            verified: true,
                            recoveryGrant: "temporary-grant",
                        },
                    }),
                    { status: 200 }
                )
            )
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({ data: { success: true } }),
                    { status: 200 }
                )
            );

        await requestPasswordRecovery("doctor@clinia.local");
        const grant = await verifyPasswordRecoveryCode(
            "doctor@clinia.local",
            "123456"
        );
        await completePasswordRecovery(
            "doctor@clinia.local",
            grant,
            "Password123!"
        );

        expect(grant).toBe("temporary-grant");
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            expect.stringContaining("/api/auth/password-recovery/request"),
            expect.objectContaining({
                body: JSON.stringify({ email: "doctor@clinia.local" }),
            })
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining("/api/auth/password-recovery/verify"),
            expect.objectContaining({
                body: JSON.stringify({
                    email: "doctor@clinia.local",
                    code: "123456",
                }),
            })
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            expect.stringContaining("/api/auth/password-recovery/complete"),
            expect.objectContaining({
                body: JSON.stringify({
                    email: "doctor@clinia.local",
                    recoveryGrant: "temporary-grant",
                    newPassword: "Password123!",
                }),
            })
        );
    });

    it("reports when password recovery delivery is unavailable", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(
                JSON.stringify({ data: { passwordRecoveryAvailable: false } }),
                { status: 200 }
            )
        );

        await expect(isPasswordRecoveryAvailable()).resolves.toBe(false);
    });
});
