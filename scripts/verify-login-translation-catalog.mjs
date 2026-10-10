import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { APPROVED_UI_TRANSLATION_CATALOG } from "../backend/scripts/i18n/approvedUiTranslationCatalog.js";

// Test-time source inspection only; backend runtime never imports frontend TS.
const source = await readFile(new URL("../frontend/src/i18n/uiLabels.fr.ts", import.meta.url), "utf8");
const compiled = stripTypeScriptTypes(source).replace(/^export /gm, "");
const labels = runInNewContext(`${compiled}\nUI_LABELS_FR;`, {}, { timeout: 1000 });
function leaves(value, prefix) {
    return Object.entries(value).flatMap(([name, child]) =>
        typeof child === "string" ? [[`${prefix}.${name}`, child]] : leaves(child, `${prefix}.${name}`));
}
const expected = leaves(labels.loginPage, "login");
assert.equal(expected.length, 49, "Review any change to login label coverage");
const actual = APPROVED_UI_TRANSLATION_CATALOG.filter(entry => entry.key.startsWith("login."));
assert.equal(actual.length, expected.length, "Missing or duplicate approved login labels");
const catalogByKey = new Map(APPROVED_UI_TRANSLATION_CATALOG.map(entry => [entry.key, entry]));
assert.equal(catalogByKey.size, APPROVED_UI_TRANSLATION_CATALOG.length, "Duplicate stable translation keys");
const frontendKeys = JSON.parse(await readFile(new URL("../frontend/src/i18n/approvedUiKeys.json", import.meta.url), "utf8"));
assert.deepEqual(frontendKeys, Object.fromEntries(APPROVED_UI_TRANSLATION_CATALOG.map(({ key, text }) => [key, text])),
    "Frontend approved keys must match the backend catalog, including their French source");
for (const [key, text] of [...expected, ...leaves(labels.auth.session, "auth.session").filter(([key]) => catalogByKey.has(key))]) {
    const entry = catalogByKey.get(key);
    assert.ok(entry, `Missing approved key: ${key}`);
    assert.equal(entry.namespace, "login", `Namespace mismatch: ${key}`);
    assert.equal(entry.text, text, `French source drift: ${key}`);
}
console.log("LOGIN_TRANSLATION_CATALOG_PARITY_PASSED labels=49");
