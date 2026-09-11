import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { once } from "node:events";
const mocks = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), audit: vi.fn() }));
vi.mock("../../middleware/verifyJWT.js", () => ({ verifyJWT: (req, res, next) => {
    if (!req.headers["x-test-role"]) return res.status(401).end();
    req.auth = { userId: "507f1f77bcf86cd799439011", role: req.headers["x-test-role"] }; next();
} }));
vi.mock("../../models/ValidationReportAudit.js", () => ({ ValidationReportAudit: { create: mocks.audit } }));
vi.mock("../../services/validationReports.js", () => ({ listValidationReports: mocks.list, getValidationReport: mocks.get }));
import router from "../validationReports.js";
import { EXPECTED } from "../../services/validationReportFormat.js";
let server;
afterEach(async () => { if (server) await new Promise(resolve => server.close(resolve)); vi.resetAllMocks(); });
async function request(role, route = "/") {
    if (!server?.listening) { const app = express(); app.use(router); server = app.listen(0, "127.0.0.1"); await once(server, "listening"); }
    return fetch(`http://127.0.0.1:${server.address().port}${route}`, { headers: role ? { "x-test-role": role } : {} });
}
describe("SUPERADMIN validation archive", () => {
    it.each([null, "RECEPTION", "MEDECIN", "ADMIN", "USER"])("denies list and export to %s", async role => {
        for (const route of ["/", "/id/pdf", "/id/bundle"]) expect((await request(role, route)).status).toBe(role ? 403 : 401);
        expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.get).not.toHaveBeenCalled();
    });
    it("audits consultation without adding clinical access", async () => {
        mocks.list.mockResolvedValue({ reports: [] }); mocks.audit.mockResolvedValue({});
        const res = await request("SUPERADMIN"); expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toBe("no-store");
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "LIST", userId: expect.any(String), ip: "127.0.0.1" }));
    });
    it("fails closed without exposing errors when audit persistence fails", async () => {
        mocks.list.mockResolvedValue({ reports: [] }); mocks.audit.mockRejectedValue(new Error("secret details"));
        const res = await request("SUPERADMIN"); expect(res.status).toBe(503); expect(await res.text()).not.toContain("secret details");
    });
    it("audits a PDF download and refuses the export if its audit fails", async () => {
        const r = { schemaVersion: 1, runId: "d8d430a9-3134-4e48-952a-208e13124a6a", commit: "a".repeat(40), dirty: false,
            startedAt: "2026-09-11T10:00:00.000Z", finishedAt: "2026-09-11T10:01:00.000Z", environment: "isolated-local-mongo", nodeVersion: "v20.20.0", exitCode: 0, cleanup: true, unhandledErrors: 0,
            cases: EXPECTED.flatMap((n, point) => Array.from({ length: n }, (_, i) => ({ point, index: i + 1, state: "passed", durationMs: 1 }))) };
        mocks.get.mockResolvedValue(r); mocks.audit.mockResolvedValue({});
        const res = await request("SUPERADMIN", `/${r.runId}/pdf`);
        expect(res.status).toBe(200); expect(await res.text()).toMatch(/^%PDF/);
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "DOWNLOAD", runId: r.runId, format: "pdf" }));
        mocks.audit.mockRejectedValue(new Error("audit failed"));
        expect((await request("SUPERADMIN", `/${r.runId}/bundle`)).status).toBe(503);
    });
});
