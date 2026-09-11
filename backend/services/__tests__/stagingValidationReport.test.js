import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, it, expect } from "vitest";

const source = readFileSync(new URL("../../../rebuild-local.sh", import.meta.url), "utf8");
const helper = source.match(/  run_staging_validation_report\(\) \{[\s\S]*?\n  \}/)?.[0];
function run(code) {
    // Exercise the actual helper without Docker, npm, services or filesystem writes.
    return spawnSync("bash", ["-c", `set -eu
ROOT_DIR='/tmp/clinia staging test'
headline() { :; }
npm() { printf 'ARGS:%s\\n' "$*"; printf 'REPORT_DIR:%s\\n' "$CLINIA_VALIDATION_REPORT_DIR"; return ${code}; }
${helper}
run_staging_validation_report
echo REBUILD_CONTINUES
`], { encoding: "utf8", env: { ...process.env, CLINIA_VALIDATION_REPORT_DIR: "/unused/override" } });
}
describe("staging validation report integration", () => {
    it("runs after unit tests and before announcing readiness", () => {
        expect(helper).toBeTruthy();
        const call = source.indexOf("\n  run_staging_validation_report\n");
        expect(call).toBeGreaterThan(source.indexOf("\n  run_staging_unit_tests\n"));
        expect(call).toBeLessThan(source.indexOf('headline "Staging ready"'));
        expect(source.indexOf('mkdir -p "$ROOT_DIR/validation-artifacts"')).toBeLessThan(source.indexOf('sdc up -d mongo-rs-1'));
    });
    it("uses the mounted archive directory and continues on success", () => {
        const result = run(0);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain("ARGS:--prefix /tmp/clinia staging test/backend run test:validation-report");
        expect(result.stdout).toContain("REPORT_DIR:/tmp/clinia staging test/validation-artifacts");
        expect(result.stdout).toContain("OK Rapport disponible");
        expect(result.stdout).toContain("REBUILD_CONTINUES");
    });
    it("propagates failure without announcing success", () => {
        const result = run(7);
        expect(result.status).toBe(7);
        expect(result.stdout).toContain("ERREUR validation multi-RECEPTION");
        expect(result.stdout).not.toContain("OK Rapport disponible");
        expect(result.stdout).not.toContain("REBUILD_CONTINUES");
    });
});
