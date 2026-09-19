import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it, expect } from "vitest";

const directories = [];
afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function run(code) {
    // Execute the real rebuild script with a disposable CI stub and no Docker access.
    const root = mkdtempSync(path.join(tmpdir(), "clinia staging test "));
    directories.push(root);
    mkdirSync(path.join(root, "scripts"));
    mkdirSync(path.join(root, "bin"));
    copyFileSync(new URL("../../../rebuild-local.sh", import.meta.url), path.join(root, "rebuild-local.sh"));
    writeFileSync(path.join(root, "scripts/ci-local.sh"), `printf 'CI REPORT_DIR:%s\\n' "$CLINIA_VALIDATION_REPORT_DIR" >> "$TRACE"
exit "$CI_RESULT"
`);
    writeFileSync(path.join(root, "bin/docker"), `#!/bin/bash
printf 'DOCKER:%s\\n' "$*" >> "$TRACE"
# Stop the successful path at shutdown, before any actual rebuild or service access.
for arg in "$@"; do if [[ "$arg" == down ]]; then exit 42; fi; done
exit 0
`, { mode: 0o700 });
    writeFileSync(path.join(root, "bin/curl"), "#!/bin/bash\nexit 0\n", { mode: 0o700 });
    const trace = path.join(root, "trace");
    const result = spawnSync("bash", [path.join(root, "rebuild-local.sh"), "staging"], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, MODE: "STAGING", START_DOCKER_DESKTOP: "0",
            WIPE_VOLUMES: "0", TRACE: trace, CI_RESULT: String(code), CLINIA_VALIDATION_REPORT_DIR: "/unused/override" },
    });
    expect(result.error).toBeUndefined();
    return { ...result, root, trace: readFileSync(trace, "utf8").split("\n").filter(Boolean) };
}

describe("staging validation report integration", () => {
    it("runs CI once before stopping staging containers", () => {
        const result = run(0);
        const ci = result.trace.findIndex(line => line.startsWith("CI "));
        const shutdown = result.trace.findIndex(line => line.includes(" down "));
        expect(ci).toBeGreaterThanOrEqual(0);
        expect(shutdown).toBeGreaterThan(ci);
        expect(result.trace.filter(line => line.startsWith("CI "))).toHaveLength(1);
        expect(result.status).toBe(42); // Sentinel from the Docker stub, reached only after CI success.
    });
    it("overrides the report directory with the archive mounted in staging", () => {
        const result = run(0);
        expect(result.trace).toContain(`CI REPORT_DIR:${result.root}/validation-artifacts`);
        expect(result.status).toBe(42);
    });
    it("propagates CI failure without stopping containers or announcing readiness", () => {
        const result = run(7);
        expect(result.status).toBe(7);
        expect(result.trace.some(line => line.includes(" down "))).toBe(false);
        expect(result.trace.some(line => line.includes(" build "))).toBe(false);
        expect(result.stdout).not.toContain("Staging ready");
    });
});
