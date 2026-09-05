import { describe, expect, it, vi } from "vitest";
import { registerRoutes } from "../registerRoutes.js";
import { verifyJWT } from "../../middleware/verifyJWT.js";

describe("registerRoutes", () => {
    it.each(["RECEPTION", "SUPERADMIN", "ADMIN", "USER", "MEDECIN"])("protects consultations from non-physician role %s", role => {
        const app = { use: vi.fn() };
        registerRoutes(app, {});
        const [, authentication, guard] = app.use.mock.calls.find(([prefix]) => prefix === "/api/consultations");
        expect(authentication).toBe(verifyJWT);
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();
        guard({ auth: { userId: "actor", role } }, res, next);
        if (role === "MEDECIN") expect(next).toHaveBeenCalledOnce();
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
        const roleGuard = registration[2];
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();
        roleGuard({ method, originalUrl: path, auth: { userId: "reception-test", role: "RECEPTION" } }, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it.each(["USER", "MEDECIN", "ADMIN", "SUPERADMIN"])("preserves the generic patient role gate for %s (record scope is checked downstream)", role => {
        const app = { use: vi.fn() };
        registerRoutes(app, {});
        const [, , roleGuard] = app.use.mock.calls.find(([prefix]) => prefix === "/api/patients");
        const next = vi.fn();
        roleGuard({ auth: { userId: "actor-test", role } }, {}, next);
        expect(next).toHaveBeenCalledOnce();
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
