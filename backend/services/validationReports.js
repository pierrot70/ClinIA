import { readFile, readdir, open } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { RUN_ID, SHA, validateReport, summary } from "./validationReportFormat.js";

export async function readImageRevision(file = new URL("../build-revision.json", import.meta.url)) {
    // Production never reads Git HEAD or a mutable runtime environment variable.
    try {
        const value = JSON.parse(await readFile(file, "utf8"));
        if (SHA.test(value.commit || "")) return { commit: value.commit, source: "image-build" };
    } catch { /* Missing metadata is explicitly unknown. */ }
    return { commit: null, source: "unknown" };
}
export const deployedVersion = () => readImageRevision();
function directory() {
    return process.env.CLINIA_VALIDATION_REPORT_DIR || fileURLToPath(new URL("../../validation-artifacts", import.meta.url));
}
export async function getValidationReport(id) {
    if (!RUN_ID.test(id)) throw Object.assign(new Error("REPORT_NOT_FOUND"), { status: 404 });
    const file = path.join(directory(), `${id}.json`);
    let handle;
    try {
        handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > 100000) throw new Error("INVALID_REPORT");
        const report = validateReport(JSON.parse(await handle.readFile("utf8")));
        if (report.runId !== id) throw new Error("INVALID_REPORT");
        return report;
    } catch (err) {
        throw Object.assign(new Error(err.code === "ENOENT" ? "REPORT_NOT_FOUND" : "REPORT_UNAVAILABLE"), { status: err.code === "ENOENT" ? 404 : 503 });
    } finally { await handle?.close(); }
}
export async function listValidationReports() {
    const deployment = await deployedVersion();
    let names;
    try { names = await readdir(directory()); }
    catch (err) { if (err.code === "ENOENT") return { deployment, reports: [], rejected: 0 }; throw err; }
    const ids = names.filter(n => n.endsWith(".json") && RUN_ID.test(n.slice(0, -5)));
    // Bound resource usage rather than silently ignoring archives.
    if (ids.length > 1000) throw new Error("REPORT_ARCHIVE_LIMIT");
    const reports = []; let rejected = 0;
    for (const name of ids) {
        try { reports.push(summary(await getValidationReport(name.slice(0, -5)), deployment.commit)); }
        catch { rejected++; }
    }
    return { deployment, reports: reports.sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)), rejected };
}
