import { readFile } from "node:fs/promises";
import { sha256, validateReport, summary } from "../backend/services/validationReportFormat.js";
const bundle = JSON.parse(await readFile(process.argv[2], "utf8"));
const names = ["report.json", "report.pdf", "results.junit.xml", "events.jsonl"];
if (bundle.format !== "clinia-evidence-bundle-v1" || bundle.encoding !== "base64" ||
    Object.keys(bundle.files || {}).sort().join() !== names.sort().join()) throw new Error("INVALID_BUNDLE");
for (const name of names) {
    const file = bundle.files[name];
    if (sha256(Buffer.from(file.content, "base64")) !== file.sha256) throw new Error(`CHECKSUM_MISMATCH: ${name}`);
}
const report = validateReport(JSON.parse(Buffer.from(bundle.files["report.json"].content, "base64").toString()));
console.log(JSON.stringify({ checksumsValid: true, ...summary(report, null) }, null, 2));
console.log("Checksums do not authenticate the publisher. No Docker or database was used.");
