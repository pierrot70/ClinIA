import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { reportBytes, summary } from "../backend/services/validationReportFormat.js";

const root = fileURLToPath(new URL("../", import.meta.url));
if (process.env.NODE_ENV === "production") throw new Error("Run only on an isolated validation host.");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const commit = git("rev-parse", "HEAD");
const dirty = Boolean(git("status", "--porcelain"));
const startedAt = new Date().toISOString();
const runId = randomUUID();
const temporary = await mkdtemp(path.join(tmpdir(), "clinia-validation-"));
let exitCode = 1, cleanup = false, result = { cases: [], unhandledErrors: 1 };
try {
    const child = spawn("bash", ["scripts/run-urgentologist-walk-in-integration.sh", "--reporter", "./integration/validationEvidenceReporter.js"], {
        cwd: root, env: { ...process.env, CLINIA_VALIDATION_RESULT_FILE: path.join(temporary, "results.json") }, stdio: ["ignore", "pipe", "pipe"],
    });
    // Consume but never retain raw errors or logs. Only the fixed cleanup marker survives.
    let tail = "";
    child.stdout.on("data", chunk => { tail = (tail + chunk.toString()).slice(-4096); if (tail.includes("CLEANUP_OK disposable MongoDB container removed")) cleanup = true; });
    child.stderr.on("data", () => {});
    exitCode = await new Promise(resolve => { child.on("error", () => resolve(1)); child.on("close", code => resolve(Number.isInteger(code) ? code : 1)); });
    try { result = JSON.parse(await readFile(path.join(temporary, "results.json"), "utf8")); } catch { /* Setup failure remains incomplete. */ }
    const report = { schemaVersion: 1, runId, commit, dirty: dirty || git("rev-parse", "HEAD") !== commit || Boolean(git("status", "--porcelain")),
        startedAt, finishedAt: new Date().toISOString(), environment: "isolated-local-mongo", nodeVersion: process.version,
        exitCode, cleanup, unhandledErrors: result.unhandledErrors, cases: result.cases };
    const output = process.env.CLINIA_VALIDATION_REPORT_DIR || path.join(root, "validation-artifacts");
    await mkdir(output, { recursive: true, mode: 0o750 });
    await writeFile(path.join(output, `${runId}.json`), reportBytes(report), { flag: "wx", mode: 0o640 });
    const status = summary(report, null);
    console.log(JSON.stringify({ runId, commit, dirty: report.dirty, passed: status.passed, cleanup, points: status.points }));
    process.exitCode = status.passed ? 0 : 1;
} finally {
    // Exact directory created by this invocation; contains only minimized reporter output.
    await rm(temporary, { recursive: true });
}
