import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspectStrictUiSource, verifyUiLabels } from "./verify-ui-labels.mjs";

const inspect = source => inspectStrictUiSource("fixture.tsx", source);
test("comparison operators in conditional JSX are code, not UI text", () => {
    assert.deepEqual(inspect(`const view = <div>{clinics.length > 1 && (
        <select title={labels.clinic}><option>{labels.selectClinic}</option></select>
    )}{count >= 2 ? <span>{labels.many}</span> : <span>{labels.one}</span>}</div>;`), []);
});
test("operators do not hide real text inside a conditional branch", () => {
    assert.deepEqual(inspect(`const view = <div>{clinics.length > 1 && (<button>Choisir</button>)}</div>;`)
        .map(({ kind, text }) => ({ kind, text })), [{ kind: "text", text: "Choisir" }]);
});
test("reports normalized JSX text at its actual line and column", () => {
    assert.deepEqual(inspect(`const view = (
  <div>
    Bonjour   monde
  </div>
);`), [
        { kind: "text", text: "Bonjour monde", line: 3, column: 5 },
    ]);
});
test("handles CRLF positions and Unicode labels", () => {
    assert.deepEqual(inspect("const view = <div>\r\n  שלום 患者\r\n</div>;")[0],
        { kind: "text", text: "שלום 患者", line: 2, column: 3 });
});
test("ignores whitespace and punctuation-only JSX text while preserving the numeric-text guard", () => {
    assert.deepEqual(inspect(`const view = <div>
 — ... <span />
</div>;`), []);
    assert.equal(inspect(`const view = <span>123</span>;`)[0].text, "123");
});
for (const attribute of ["aria-label", "placeholder", "title", "alt"]) {
    test(`detects direct ${attribute} with either JSX quote style`, () => {
        for (const quote of ['"', "'"]) {
            assert.deepEqual(inspect(`const view = <input ${attribute}=${quote}Saisie${quote} />;`)[0], {
                kind: "attribute", attribute, text: "Saisie", line: 1, column: 21,
            });
        }
    });
}
test("detects literal attribute expressions including template and parenthesized values", () => {
    for (const expression of ['"Saisie"', "'Saisie'", "`Saisie`", '("Saisie")', '"Saisie" as string']) {
        const result = inspect(`const view = <input title={${expression}} />;`);
        assert.equal(result.length, 1); assert.equal(result[0].text, "Saisie");
    }
    assert.equal(inspect('const view = <input title={`Patient ${id}`} />;')[0].text, "Patient");
});
test("does not confuse strings, comments, unrelated attributes or label references with direct labels", () => {
    assert.deepEqual(inspect(`// title="A comment"
        const message = 'placeholder="An ordinary JavaScript string"';
        const view = <div data-title="metadata" title={count > 1 ? labels.many : labels.one}>
            {/* A JSX comment */}<img alt={labels.image} /><input placeholder={t(labels.name)} />
        </div>;`), []);
});
test("fails closed on invalid TSX rather than silently skipping nodes", () => {
    assert.ok(inspect('const view = <div><span></div>;').some(row => row.kind === "parse"));
});

test("the repository verifier rejects real labels without any file-specific exception", t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "clinia-ui-labels-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "frontend/src/i18n"), { recursive: true });
    fs.writeFileSync(path.join(root, "frontend/src/i18n/uiLabels.fr.ts"), 'export const UI_LABELS_FR = { known: "Connu" };');
    fs.writeFileSync(path.join(root, "frontend/src/App.tsx"), 'const view = <button title="Aide">Texte direct</button>;');
    const errors = verifyUiLabels(root);
    assert.equal(errors.length, 2);
    assert.ok(errors.some(error => error.includes('direct title text "Aide"')));
    assert.ok(errors.some(error => error.includes('direct JSX text "Texte direct"')));
    assert.ok(errors.every(error => error.startsWith("frontend/src/App.tsx:1:")));
});
