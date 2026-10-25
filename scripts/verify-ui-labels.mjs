import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const require = createRequire(path.join(repoRoot, "frontend/package.json"));
const ts = require("typescript");
const strictFiles = ["frontend/src/App.tsx"];
const uiTextAttributes = new Set(["aria-label", "placeholder", "title", "alt"]);

function isMeaningfulText(value) {
    return /[\p{L}\p{N}]/u.test(value.trim());
}
const normalize = value => value.replace(/\s+/gu, " ").trim();

// Read actual TSX nodes: comparison operators, comments and JavaScript strings
// are not JSX text. This intentionally does not infer dynamic dataflow.
export function inspectStrictUiSource(file, source) {
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const findings = [];
    function add(kind, text, position, attribute) {
        const { line, character } = tree.getLineAndCharacterOfPosition(position);
        findings.push({ kind, text, line: line + 1, column: character + 1,
            ...(attribute ? { attribute } : {}) });
    }
    for (const diagnostic of tree.parseDiagnostics) {
        add("parse", ts.flattenDiagnosticMessageText(diagnostic.messageText, " "), diagnostic.start ?? 0);
    }
    function literalText(expression) {
        if (!expression) return null;
        if (ts.isStringLiteralLike(expression)) return expression.text;
        if (ts.isTemplateExpression(expression)) {
            return [expression.head.text, ...expression.templateSpans.map(span => span.literal.text)].join(" ");
        }
        if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isNonNullExpression(expression)) {
            return literalText(expression.expression);
        }
        return null;
    }
    function visit(node) {
        if (ts.isJsxText(node)) {
            const text = normalize(node.text);
            if (isMeaningfulText(text)) {
                const raw = source.slice(node.pos, node.end);
                add("text", text, node.pos + Math.max(0, raw.search(/\S/u)));
            }
        }
        if (ts.isJsxAttribute(node) && uiTextAttributes.has(node.name.getText(tree))) {
            const initializer = node.initializer;
            const value = initializer && (ts.isJsxExpression(initializer)
                ? literalText(initializer.expression) : literalText(initializer));
            if (typeof value === "string" && isMeaningfulText(value)) {
                add("attribute", normalize(value), node.getStart(tree), node.name.getText(tree));
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(tree);
    return findings;
}

export function verifyUiLabels(root = repoRoot) {
    const errors = [];
    const labelsPath = path.join(root, "frontend/src/i18n/uiLabels.fr.ts");
    if (!fs.existsSync(labelsPath)) {
        errors.push("frontend/src/i18n/uiLabels.fr.ts is missing.");
    } else {
        const source = fs.readFileSync(labelsPath, "utf8");
        if (!source.includes("UI_LABELS_FR")) {
            errors.push("frontend/src/i18n/uiLabels.fr.ts must export UI_LABELS_FR.");
        }
        for (const match of source.matchAll(/:\s*"([^"]*)"/g)) {
            if (!match[1].trim()) {
                const line = source.slice(0, match.index).split("\n").length;
                errors.push(`frontend/src/i18n/uiLabels.fr.ts:${line} contains an empty UI label.`);
            }
        }
    }
    for (const file of strictFiles) {
        const source = fs.readFileSync(path.join(root, file), "utf8");
        for (const finding of inspectStrictUiSource(file, source)) {
            const location = `${file}:${finding.line}:${finding.column}`;
            if (finding.kind === "parse") {
                errors.push(`${location} has invalid TSX syntax: ${finding.text}`);
            } else {
                const kind = finding.kind === "text" ? "JSX" : finding.attribute;
                errors.push(`${location} has direct ${kind} text ${JSON.stringify(finding.text)}. Use labels from frontend/src/i18n/uiLabels.fr.ts.`);
            }
        }
    }
    return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
    const errors = verifyUiLabels();
    if (errors.length > 0) {
        console.error("UI label verification failed:");
        for (const error of errors) console.error(`- ${error}`);
        process.exitCode = 1;
    } else {
        console.log("UI label verification passed.");
    }
}
