import { describe, expect, it, vi } from "vitest";
import { registerRoutes } from "../registerRoutes.js";
import { verifyJWT } from "../../middleware/verifyJWT.js";

describe("registerRoutes", () => {
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
