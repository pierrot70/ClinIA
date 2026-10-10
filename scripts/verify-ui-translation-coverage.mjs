#!/usr/bin/env node
// Offline coverage: imports only the versioned static i18n modules, never an
// application service, database, session or generated clinical content.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const i18nRoot = path.join(root, "frontend/src/i18n");
const require = createRequire(path.join(root, "frontend/package.json"));
const ts = require("typescript");
const loaded = new Map();
function load(relative) {
    let file = path.resolve(i18nRoot, relative);
    if (!/\.(?:ts|json)$/.test(file)) file += ".ts";
    if (!file.startsWith(i18nRoot + path.sep)) throw Error("Only static i18n modules are permitted");
    if (loaded.has(file)) return loaded.get(file);
    if (file.endsWith(".json")) return JSON.parse(fs.readFileSync(file, "utf8"));
    const exports = {};
    loaded.set(file, exports);
    const context = { exports, require: id => load(path.resolve(path.dirname(file), id)), console };
    const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(compiled, context, { filename: file });
    return exports;
}
function leaves(value, key = "") {
    if (typeof value === "string") return [{ key, source: value }];
    if (!value || typeof value !== "object") return [];
    return Object.entries(value).flatMap(([name, child]) => leaves(child, key ? `${key}.${name}` : name));
}
const { UI_LABELS_FR } = load("uiLabels.fr");
const { UI_LOCALES, validUiTranslation } = load("uiLocales");
const { getLocalUiTranslation } = load("localUiTranslations");
// These sample medical texts intentionally render in English (lang=en,
// translate=no), independently of the UI selector. Keep UI titles and controls
// within coverage; this exception never applies to new labels automatically.
const englishClinicalContent = new Set([
    "walkInEmergencyReminder", "quickModePanel.first", "quickModePanel.second", "quickModePanel.third",
    "patientSummaryExample.panel.medication", "patientSummaryExample.panel.instruction",
    "patientSummaryExample.panel.summary",
    "patientSummaryExample.panel.monitoring", "patientSummaryExample.panel.followUp",
]);
const allRows = leaves(UI_LABELS_FR);
const excluded = allRows.filter(row => englishClinicalContent.has(row.key))
    .map(({ key }) => ({ key, reason: "Existing fixed English medical content; UI titles and controls remain localized." }));
const rows = allRows.filter(row => !englishClinicalContent.has(row.key));
const missing = [];
const identical = [];
const languages = UI_LOCALES.map(locale => {
    let available = 0;
    for (const row of rows) {
        const translated = getLocalUiTranslation(row.source, locale);
        if (!validUiTranslation(row.source, translated)) missing.push({ locale, key: row.key });
        else {
            available++;
            if (locale !== "fr-CA" && translated === row.source) identical.push({ locale, key: row.key });
        }
    }
    return { locale, total: rows.length, available, missing: rows.length - available };
});
const report = {
    schemaVersion: 1,
    scope: "Versioned static UI labels only; all declared locales; no network or database",
    status: missing.length ? "incomplete" : "complete-structural-coverage",
    limitations: ["Coverage and placeholder checks do not establish linguistic or clinical correctness.",
        "Identical source/target values need review; proper names and technical terms may legitimately remain identical.",
        "Rendered page states and literal strings outside the registry require the separate AST and component checks."],
    languages, missing, identical, excluded,
};
const args = process.argv.slice(2);
const outputIndex = args.indexOf("--output");
if (outputIndex !== -1) {
    if (!args[outputIndex + 1]) throw Error("--output requires a path");
    fs.writeFileSync(path.resolve(args[outputIndex + 1]), JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify({ status: report.status, languages, identical: identical.length }));
if (args.includes("--check") && missing.length) process.exitCode = 1;
