import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
export function buildRevision(candidate = "") {
    if (candidate && !/^[a-f0-9]{40}$/.test(candidate)) throw new Error("SOURCE_COMMIT must be a full Git SHA-1.");
    return JSON.stringify({ commit: candidate || null }) + "\n";
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    writeFileSync(new URL("../build-revision.json", import.meta.url), buildRevision(process.argv[2]));
}
