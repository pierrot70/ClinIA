import { execFileSync } from "node:child_process";

// ClinIA is a Vite client-side application and does not enable React Router RSC mode.
// Keep this exception narrow until a non-vulnerable released version is available.
const ALLOWED_HIGH_ADVISORIES = new Map([
    [
        "react-router",
        new Set(["GHSA-qwww-vcr4-c8h2"]),
    ],
]);

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

function advisoryId(entry) {
    if (!entry || typeof entry !== "object" || typeof entry.url !== "string") {
        return "";
    }
    return entry.url.split("/").at(-1) || "";
}

function isAllowed(packageName, advisory) {
    return ALLOWED_HIGH_ADVISORIES
        .get(packageName)
        ?.has(advisoryId(advisory)) ?? false;
}

const report = readAuditReport();
const failures = [];
const accepted = [];

for (const [packageName, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
    for (const advisory of vulnerability.via ?? []) {
        if (typeof advisory === "string") continue;
        if (!["high", "critical"].includes(advisory.severity)) continue;

        if (isAllowed(packageName, advisory)) {
            accepted.push(`${packageName}:${advisoryId(advisory)}`);
        } else {
            failures.push(`${packageName}:${advisoryId(advisory) || advisory.title}`);
        }
    }
}

for (const exception of accepted) {
    console.warn(`AUDIT_ACCEPTED_EXCEPTION ${exception} reason=client_only_router_no_rsc`);
}

if (failures.length > 0) {
    console.error(`AUDIT_FAILED ${failures.join(",")}`);
    process.exit(1);
}

console.log("AUDIT_PASSED no unapproved high or critical vulnerabilities");
