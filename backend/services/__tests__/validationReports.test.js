import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { EXPECTED, validateReport, summary, reportBytes, reportPdf, evidenceBundle, sha256 } from "../validationReportFormat.js";
import { getValidationReport, listValidationReports, deployedVersion, readImageRevision } from "../validationReports.js";
import { buildRevision } from "../../scripts/write-build-revision.mjs";
const fixture = () => ({ schemaVersion: 1, runId: randomUUID(), commit: "a".repeat(40), dirty: false,
    startedAt: "2026-09-11T10:00:00.000Z", finishedAt: "2026-09-11T10:01:00.000Z", environment: "isolated-local-mongo",
    nodeVersion: "v20.20.0", exitCode: 0, cleanup: true, unhandledErrors: 0,
    cases: EXPECTED.flatMap((n, point) => Array.from({ length: n }, (_, i) => ({ point, index: i + 1, state: "passed", durationMs: 12 }))) });
let dir;
afterEach(async () => { vi.unstubAllEnvs(); if (dir) { await rm(dir, { recursive: true }); dir = undefined; } });
describe("validation report contract", () => {
    it("reads the baked full commit; missing, short or invalid revisions never match", async () => {
        dir = await mkdtemp(path.join(tmpdir(), "clinia-revision-test-"));
        const file = path.join(dir, "revision.json");
        await writeFile(file, buildRevision("b".repeat(40)));
        expect(await readImageRevision(file)).toEqual({ commit: "b".repeat(40), source: "image-build" });
        await writeFile(file, buildRevision());
        expect((await readImageRevision(file)).commit).toBeNull();
        await writeFile(file, '{"commit":"main"}');
        expect((await readImageRevision(file)).commit).toBeNull();
        expect(() => buildRevision("44507d0")).toThrow();
    });
    it("separates successful tests from correspondence, dirty worktrees and unknown versions", () => {
        const r = fixture();
        expect(summary(r, r.commit)).toMatchObject({ passed: true, correspondence: "match" });
        expect(summary(r, "b".repeat(40)).correspondence).toBe("mismatch");
        expect(summary(r, null).correspondence).toBe("unknown");
        expect(summary({ ...r, dirty: true }, r.commit).correspondence).toBe("dirty");
        expect(summary({ ...r, exitCode: 1 }, r.commit)).toMatchObject({ passed: false, correspondence: "match" });
    });
    it.each(["cleanup", "exitCode", "unhandledErrors", "cases"])("never validates incomplete evidence: %s", field => {
        const r = fixture();
        r[field] = { cleanup: false, exitCode: 1, unhandledErrors: 1, cases: [] }[field];
        expect(summary(r, r.commit).passed).toBe(false);
    });
    it("rejects raw payloads, free-text test names, duplicate cases and malformed commits", () => {
        expect(() => validateReport({ ...fixture(), token: "secret" })).toThrow();
        const r = fixture(); r.cases[0].name = "patient name";
        expect(() => validateReport(r)).toThrow();
        const duplicate = fixture(); duplicate.cases.push(duplicate.cases[0]);
        expect(() => validateReport(duplicate)).toThrow();
        expect(() => validateReport({ ...fixture(), commit: "main" })).toThrow();
    });
    it("exports an actual PDF and a reproducible bundle with verified checksums", () => {
        const r = fixture();
        expect(reportPdf(r).toString().startsWith("%PDF-1.4")).toBe(true);
        const bundle = JSON.parse(evidenceBundle(r));
        for (const entry of Object.values(bundle.files)) expect(sha256(Buffer.from(entry.content, "base64"))).toBe(entry.sha256);
        expect(Buffer.from(bundle.files["report.json"].content, "base64")).toEqual(reportBytes(r));
        expect(Buffer.from(bundle.files["results.junit.xml"].content, "base64").toString()).toContain('tests="21"');
    });
    it("reads only schema-valid regular archives, excluding symlinks and mismatched identifiers", async () => {
        dir = await mkdtemp(path.join(tmpdir(), "clinia-report-test-")); vi.stubEnv("CLINIA_VALIDATION_REPORT_DIR", dir);
        const r = fixture(); await writeFile(path.join(dir, `${r.runId}.json`), reportBytes(r));
        await writeFile(path.join(dir, `${randomUUID()}.json`), JSON.stringify({ token: "secret" }));
        await symlink(path.join(dir, `${r.runId}.json`), path.join(dir, `${randomUUID()}.json`));
        const result = await listValidationReports();
        expect(result.reports).toHaveLength(1); expect(result.rejected).toBe(2);
        await expect(getValidationReport("../secret")).rejects.toMatchObject({ status: 404 });
        await expect(getValidationReport(randomUUID())).rejects.toMatchObject({ status: 404 });
    });
    it("does not trust a runtime SOURCE_COMMIT", async () => {
        vi.stubEnv("SOURCE_COMMIT", "f".repeat(40));
        expect(await deployedVersion()).toEqual({ commit: null, source: "unknown" });
    });
});
