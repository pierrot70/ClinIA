import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const labelsPath = path.join(repoRoot, "frontend/src/i18n/uiLabels.fr.ts");

const strictFiles = [
    "frontend/src/App.tsx",
];

const uiTextAttributes = [
    "aria-label",
    "placeholder",
    "title",
    "alt",
];

const errors = [];

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function lineNumber(source, index) {
    return source.slice(0, index).split("\n").length;
}

function isMeaningfulText(value) {
    return /[\p{L}\p{N}]/u.test(value.trim());
}

function validateLabelsSource() {
    if (!fs.existsSync(labelsPath)) {
        errors.push("frontend/src/i18n/uiLabels.fr.ts is missing.");
        return;
    }

    const source = fs.readFileSync(labelsPath, "utf8");
    if (!source.includes("UI_LABELS_FR")) {
        errors.push("frontend/src/i18n/uiLabels.fr.ts must export UI_LABELS_FR.");
    }

    const stringLiteralMatches = source.matchAll(/:\s*"([^"]*)"/g);
    for (const match of stringLiteralMatches) {
        if (!match[1].trim()) {
            errors.push(
                `frontend/src/i18n/uiLabels.fr.ts:${lineNumber(source, match.index)} contains an empty UI label.`
            );
        }
    }
}

function validateStrictFile(relativePath) {
    const source = readRepoFile(relativePath);

    const jsxTextPattern = />\s*([^<>{}][^<>{}]*)\s*</gmu;
    for (const match of source.matchAll(jsxTextPattern)) {
        const text = match[1].replace(/\s+/g, " ").trim();
        if (isMeaningfulText(text)) {
            errors.push(
                `${relativePath}:${lineNumber(source, match.index)} has direct JSX text "${text}". Use labels from frontend/src/i18n/uiLabels.fr.ts.`
            );
        }
    }

    for (const attribute of uiTextAttributes) {
        const attrPattern = new RegExp(`${attribute}="([^"]+)"`, "gmu");
        for (const match of source.matchAll(attrPattern)) {
            const text = match[1].trim();
            if (isMeaningfulText(text)) {
                errors.push(
                    `${relativePath}:${lineNumber(source, match.index)} has direct ${attribute} text "${text}". Use labels from frontend/src/i18n/uiLabels.fr.ts.`
                );
            }
        }
    }
}

validateLabelsSource();
for (const strictFile of strictFiles) {
    validateStrictFile(strictFile);
}

if (errors.length > 0) {
    console.error("UI label verification failed:");
    for (const error of errors) {
        console.error(`- ${error}`);
    }
    process.exit(1);
}

console.log("UI label verification passed.");
