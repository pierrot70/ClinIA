import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalFetch = globalThis.fetch;

function makeAccessToken(userId: string, role: string): string {
    const payload = btoa(JSON.stringify({ sub: userId, role, exp: Math.floor(Date.now() / 1000) + 3600 }));
    return `header.${payload.replace(/=/g, "")}.signature`;
}

describe("authService tab session isolation", () => {
    beforeEach(() => {
        vi.resetModules();
        window.sessionStorage.clear();
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        window.sessionStorage.clear();
    });

    it("refuses a refreshed identity that differs from the tab's explicit login", async () => {
        const doctorToken = makeAccessToken("doctor-1", "MEDECIN");
        const superadminToken = makeAccessToken("superadmin-1", "SUPERADMIN");
        globalThis.fetch = vi
            .fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ data: {
                accessToken: doctorToken,
                user: { id: "doctor-1", email: "doctor@clinia.test", role: "MEDECIN" },
            } }), { status: 200, headers: { "Content-Type": "application/json" } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ data: {
                accessToken: superadminToken,
                user: { id: "superadmin-1", email: "superadmin@clinia.test", role: "SUPERADMIN" },
            } }), { status: 200, headers: { "Content-Type": "application/json" } }));

        const authService = await import("./authService");
        await authService.login({ email: "doctor@clinia.test", password: "password123" });

        // Simulate a browser refresh: in-memory state is reset, but this tab's
        // sessionStorage expectation remains while the shared cookie has been
        // replaced by a different account.
        vi.resetModules();
        const reloadedAuthService = await import("./authService");

        await expect(reloadedAuthService.bootstrapSession()).resolves.toBeNull();
        expect(reloadedAuthService.getUser()).toBeNull();

        const notice = reloadedAuthService.consumeAuthSecurityNotice();
        expect(notice).toMatchObject({ code: "SESSION_REPLACED" });
    });
});
