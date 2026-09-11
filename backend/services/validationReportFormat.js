import { createHash } from "node:crypto";

export const POINTS = [
    "Legacy walk-in integration", "Same slot, two reception accounts", "Same patient, different slots",
    "Last urgentologist place (19 to 20)", "Booking, cancellation and rescheduling",
    "API authorization", "Atomic rollback and minimized audits",
];
export const EXPECTED = [3, 1, 2, 1, 4, 8, 2];
export const SHA = /^[a-f0-9]{40}$/;
export const RUN_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const integer = n => Number.isSafeInteger(n) && n >= 0;
const date = d => typeof d === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(d) && Number.isFinite(Date.parse(d));
const exact = (object, keys) => object && typeof object === "object" && Object.keys(object).sort().join() === keys.sort().join();

// Reject free text and unexpected fields: reports are never clinical/log uploads.
export function validateReport(r) {
    if (!exact(r, ["schemaVersion", "runId", "commit", "dirty", "startedAt", "finishedAt", "environment", "nodeVersion", "exitCode", "cleanup", "unhandledErrors", "cases"]) ||
        r.schemaVersion !== 1 || !RUN_ID.test(r.runId) || !SHA.test(r.commit) || typeof r.dirty !== "boolean" ||
        !date(r.startedAt) || !date(r.finishedAt) || r.finishedAt < r.startedAt ||
        r.environment !== "isolated-local-mongo" || !/^v\d+\.\d+\.\d+$/.test(r.nodeVersion) ||
        !integer(r.exitCode) || !integer(r.unhandledErrors) || typeof r.cleanup !== "boolean" ||
        !Array.isArray(r.cases) || r.cases.length > 100) throw new Error("INVALID_VALIDATION_REPORT");
    for (const c of r.cases) {
        if (!exact(c, ["point", "index", "state", "durationMs"]) || !integer(c.point) || c.point > 6 ||
            !integer(c.index) || c.index < 1 || !["passed", "failed", "skipped", "pending"].includes(c.state) || !integer(c.durationMs)) throw new Error("INVALID_VALIDATION_REPORT");
    }
    if (new Set(r.cases.map(c => `${c.point}:${c.index}`)).size !== r.cases.length) throw new Error("INVALID_VALIDATION_REPORT");
    return r;
}
export function summary(r, deployedCommit) {
    const points = POINTS.map((name, point) => ({ point, name, expected: EXPECTED[point],
        passed: r.cases.filter(c => c.point === point && c.state === "passed").length,
        total: r.cases.filter(c => c.point === point).length }));
    const passed = r.exitCode === 0 && r.cleanup && r.unhandledErrors === 0 && points.every(p => p.passed === p.expected && p.total === p.expected);
    return { runId: r.runId, commit: r.commit, dirty: r.dirty, startedAt: r.startedAt, finishedAt: r.finishedAt,
        passed, cleanup: r.cleanup, points,
        correspondence: !SHA.test(deployedCommit || "") ? "unknown" : r.dirty ? "dirty" : r.commit === deployedCommit ? "match" : "mismatch" };
}
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export const reportBytes = report => Buffer.from(JSON.stringify(validateReport(report), null, 2) + "\n");

// A small, dependency-free PDF. All variable text is restricted by validateReport.
export function reportPdf(report) {
    const r = validateReport(report), s = summary(r, null);
    const lines = ["ClinIA - Reception validation evidence", `Run: ${r.runId}`, `Tested commit: ${r.commit}`,
        `Started: ${r.startedAt}`, `Finished: ${r.finishedAt}`, `Environment: ${r.environment}`,
        `Node: ${r.nodeVersion}`, `Uncommitted changes: ${r.dirty ? "YES - commit alone is insufficient" : "no"}`,
        `Result: ${s.passed ? "PASSED" : "FAILED / INCOMPLETE"}`, `Temporary database cleanup: ${r.cleanup ? "confirmed" : "NOT confirmed"}`,
        "", ...s.points.map(p => `${p.point}. ${p.name}: ${p.passed}/${p.expected} passed (${p.total} executed)`),
        "", "Scope: two authenticated RECEPTION accounts; real API and MongoDB transactions.",
        "This is not a Coolify runtime test or a security/compliance certification.",
        "Only the listed scenarios are covered; no multi-instance/failover guarantee.",
        "No raw requests, tokens, patient identifiers or clinical notes are included.",
        "Hashes detect changes; they do not authenticate the publisher.",
        "Compare the tested commit with the commit of the deployed backend image.",
        `Report JSON SHA-256:`, sha256(reportBytes(r))];
    const stream = "BT /F1 10 Tf 40 795 Td 15 TL\n" + lines.map((l, i) => `${i ? "T* " : ""}(${l.replace(/[\\()]/g, "\\$&")}) Tj`).join("\n") + "\nET";
    const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
    let pdf = "%PDF-1.4\n", offsets = [0];
    objects.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(pdf);
}
export function evidenceBundle(r) {
    validateReport(r);
    const failures = r.cases.filter(c => c.state === "failed").length;
    const skipped = r.cases.filter(c => ["skipped", "pending"].includes(c.state)).length;
    const junit = `<testsuite name="ClinIA reception" tests="${r.cases.length}" failures="${failures}" skipped="${skipped}">\n` +
        r.cases.map(c => `<testcase classname="point-${c.point}" name="case-${c.index}" time="${c.durationMs / 1000}">${c.state === "failed" ? '<failure message="Assertion failed; raw details withheld"/>' : c.state !== "passed" ? "<skipped/>" : ""}</testcase>`).join("\n") + "\n</testsuite>\n";
    const files = { "report.json": reportBytes(r), "report.pdf": reportPdf(r), "results.junit.xml": Buffer.from(junit),
        "events.jsonl": Buffer.from(r.cases.map(c => JSON.stringify({ event: "TEST_RESULT", ...c })).join("\n") + "\n") };
    return Buffer.from(JSON.stringify({ format: "clinia-evidence-bundle-v1", encoding: "base64",
        files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, { sha256: sha256(bytes), content: bytes.toString("base64") }])) }, null, 2) + "\n");
}
