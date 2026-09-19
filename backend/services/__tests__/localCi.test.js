import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const directories = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function fixture() {
    const directory = mkdtempSync(path.join(tmpdir(), "clinia-ci-fixture-"));
    directories.push(directory);
    const trace = path.join(directory, "trace");
    writeFileSync(path.join(directory, "npm"), `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2).join(' ');
fs.appendFileSync(process.env.FIXTURE_TRACE,path.basename(process.cwd())+':'+args+'\\n');
if(args==='audit --json') { fs.writeSync(1,process.env.FIXTURE_AUDIT); process.exit(Number(process.env.FIXTURE_AUDIT_EXIT||0)); }
if(args===process.env.FIXTURE_FAIL_COMMAND) process.exit(7);
`, { mode: 0o700 });
    writeFileSync(path.join(directory, "node"), '#!/bin/bash\nif [[ "$1" == -e ]]; then exit "${FIXTURE_NODE_EXIT:-0}"; fi\nexit 0\n', { mode: 0o700 });
    writeFileSync(path.join(directory, "docker"), '#!/bin/bash\nexit 0\n', { mode: 0o700 });
    return { trace, env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, NODE_ENV: "test", DOCKER_HOST: "unix:///synthetic/docker.sock", FIXTURE_TRACE: trace } };
}

describe("local CI failure propagation", () => {
    it("stops at failed tests without building, running integration or claiming success", () => {
        const f = fixture();
        const result = spawnSync("bash", [path.join(root, "scripts/ci-local.sh")], { encoding: "utf8", env: { ...f.env, FIXTURE_FAIL_COMMAND: "test -- --run" } });
        expect(result.status).toBe(7);
        const calls = readFileSync(f.trace, "utf8");
        expect(calls).toContain("frontend:test -- --run");
        expect(calls).not.toContain("run build");
        expect(calls).not.toContain("test:validation-report");
        expect(result.stdout).not.toContain("CI_LOCAL_PASSED");
    });
    it("refuses an unsupported Node version before installing dependencies", () => {
        const f = fixture();
        const result = spawnSync("bash", [path.join(root, "scripts/ci-local.sh")], { encoding: "utf8", env: { ...f.env, FIXTURE_NODE_EXIT: "1" } });
        expect(result.status).toBe(1);
        expect(existsSync(f.trace)).toBe(false);
        expect(result.stdout).not.toContain("CI_LOCAL_PASSED");
    });
    it("does not present a single passing step as a complete CI", () => {
        const f = fixture();
        const result = spawnSync("bash", [path.join(root, "scripts/ci-local.sh"), "backend", "tests"], { encoding: "utf8", env: f.env });
        expect(result.status).toBe(0);
        expect(readFileSync(f.trace, "utf8")).toContain("backend:test -- --run");
        expect(result.stdout).not.toContain("CI_LOCAL_PASSED");
    });
});

describe("npm audit evidence", () => {
    it.each([
        [{ auditReportVersion: 2, vulnerabilities: {} }, 0, 0, "AUDIT_PASSED"],
        [{ error: { code: "ENOTFOUND" } }, 1, 1, "AUDIT_UNAVAILABLE"],
        [{}, 0, 1, "AUDIT_UNAVAILABLE"],
        [{ auditReportVersion: 2, vulnerabilities: { synthetic: { via: [{ severity: "high", url: "https://example.invalid/GHSA-synthetic" }] } } }, 1, 1, "AUDIT_FAILED"],
    ])("returns %s as an explicit audit outcome", (report, npmExit, expectedExit, marker) => {
        const f = fixture();
        const result = spawnSync(process.execPath, [path.join(root, "scripts/verify-npm-audit.mjs")], { encoding: "utf8", env: { ...f.env, FIXTURE_AUDIT: JSON.stringify(report), FIXTURE_AUDIT_EXIT: String(npmExit) } });
        expect(result.status).toBe(expectedExit);
        expect(result.stdout + result.stderr).toContain(marker);
        if (expectedExit !== 0) expect(result.stdout).not.toContain("AUDIT_PASSED");
    });
});
