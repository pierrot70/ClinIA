import { execFileSync } from "node:child_process";

function readAuditReport() {
    try {
        return JSON.parse(
            execFileSync("npm", ["audit", "--json"], {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "pipe"],
            })
        );
    } catch (error) {
        if (typeof error.stdout === "string" && error.stdout.trim()) {
            return JSON.parse(error.stdout);
        }
        throw error;
    }
}

const report = readAuditReport();
const failures = [];

for (const [packageName, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
    for (const advisory of vulnerability.via ?? []) {
        if (typeof advisory === "string") continue;
        if (!["high", "critical"].includes(advisory.severity)) continue;
        const advisoryId = typeof advisory.url === "string"
            ? advisory.url.split("/").at(-1)
            : "";
        failures.push(`${packageName}:${advisoryId || advisory.title}`);
    }
}

if (failures.length > 0) {
    console.error(`AUDIT_FAILED ${failures.join(",")}`);
    process.exit(1);
}

console.log("AUDIT_PASSED no unapproved high or critical vulnerabilities");
