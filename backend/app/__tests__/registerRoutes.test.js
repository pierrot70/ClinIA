import { describe, expect, it, vi } from "vitest";
import { registerRoutes } from "../registerRoutes.js";
import { verifyJWT } from "../../middleware/verifyJWT.js";

describe("registerRoutes", () => {
    it.each(["RECEPTION", "SUPERADMIN", "ADMIN", "USER", "MEDECIN", "IPS"])("protects consultations with the clinical role gate for %s", role => {
        const app = { use: vi.fn() };
        registerRoutes(app, {});
        const [, authentication, scopeGuard, guard] = app.use.mock.calls.find(([prefix]) => prefix === "/api/consultations");
        expect(scopeGuard.name).toBe("ipsScope");
        expect(authentication).toBe(verifyJWT);
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();
        guard({ auth: { userId: "actor", role } }, res, next);
        if (["MEDECIN", "IPS"].includes(role)) expect(next).toHaveBeenCalledOnce();
        else { expect(res.status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled(); }
    });
    it.each([
        ["GET", "/api/patients"],
        ["POST", "/api/patients"],
        ["GET", "/api/patients/patient-test"],
        ["PATCH", "/api/patients/patient-test"],
        ["DELETE", "/api/patients/patient-test"],
        ["GET", "/api/patients/patient-test/clinical-note-versions"],
        ["POST", "/api/patients/patient-test/clinical-note-versions/version-test/restore"],
        ["GET", "/api/patients/patient-test/secure-request-documents"],
    ])("denies RECEPTION at the generic patient mount before routing %s %s", (method, path) => {
        const app = { use: vi.fn() };
        registerRoutes(app, {});
        const registration = app.use.mock.calls.find(([prefix]) => prefix === "/api/patients");
        expect(registration[1]).toBe(verifyJWT);
        expect(registration[2].name).toBe("ipsScope");
        const roleGuard = registration[3];
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();
        roleGuard({ method, originalUrl: path, auth: { userId: "reception-test", role: "RECEPTION" } }, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it.each(["USER", "MEDECIN", "ADMIN", "SUPERADMIN"])("preserves the generic patient role gate for %s (record scope is checked downstream)", role => {
        const app = { use: vi.fn() };
        registerRoutes(app, {});
        const [, , scopeGuard, roleGuard] = app.use.mock.calls.find(([prefix]) => prefix === "/api/patients");
        expect(scopeGuard.name).toBe("ipsScope");
        const next = vi.fn();
        roleGuard({ auth: { userId: "actor-test", role } }, {}, next);
        expect(next).toHaveBeenCalledOnce();
    });

    it.each(["/api/patients", "/api/appointments", "/api/consultations"])("places the IPS scope guard before the role gate on %s", async path => {
        const app = { use: vi.fn() };
        registerRoutes(app, {});
        const registration = app.use.mock.calls.find(([prefix]) => prefix === path);
        expect(registration[1]).toBe(verifyJWT);
        expect(registration[2].name).toBe("ipsScope");
        expect(registration[3].name).toBe("roleGuard");
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();
        // Even though the role gate knows IPS, an invalid scoped identity is
        // rejected before it can reach any record service.
        await registration[2]({ auth: { userId: "invalid-scoped-identity", role: "IPS" } }, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it("preserves reception's dedicated authenticated route mount", () => {
        const app = { use: vi.fn() };
        registerRoutes(app, {});
        const [, authentication, roleGuard] = app.use.mock.calls.find(([prefix]) => prefix === "/api/reception");
        expect(authentication).toBe(verifyJWT);
        const next = vi.fn();
        roleGuard({ auth: { userId: "reception-test", role: "RECEPTION" } }, {}, next);
        expect(next).toHaveBeenCalledOnce();
    });

    it("requires full session validation for every db-status endpoint", () => {
        const app = { use: vi.fn() };

        registerRoutes(app, {});

        const dbStatusRegistration = app.use.mock.calls.find(
            ([path]) => path === "/api/db-status"
        );

        expect(dbStatusRegistration).toBeDefined();
        expect(dbStatusRegistration[1]).toBe(verifyJWT);
    });

    it("registers the CSP reporting endpoint before protected incident routes", () => {
        const app = { use: vi.fn() };

        registerRoutes(app, {});

        const reportRegistration = app.use.mock.calls.find(
            ([path]) => path === "/api/security/csp-reports"
        );

        expect(reportRegistration).toBeDefined();
        expect(reportRegistration).not.toContain(verifyJWT);
    });
});
