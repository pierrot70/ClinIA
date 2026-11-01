import { describe, expect, it } from "vitest";
import ValidationEvidenceReporter from "../../integration/validationEvidenceReporter.js";

const task = fullName => ({ fullName, result: () => ({ state: "passed" }), diagnostic: () => ({ duration: 1.2 }) });
describe("validation reporter stable point classification", () => {
    it("keeps points one to six distinct and classifies the four new routing/comparison cases as point zero", () => {
        const reporter = new ValidationEvidenceReporter();
        for (let point = 1; point <= 6; point++) reporter.onTestCaseResult(task(`${point}. Existing synthetic scenario`));
        for (const title of ["12. Ordered nearby IPS routing first", "12. Ordered nearby IPS routing second", "13. Explicit earlier comparison first", "13. Explicit earlier comparison second"]) reporter.onTestCaseResult(task(title));
        expect(reporter.cases.map(row => row.point)).toEqual([1, 2, 3, 4, 5, 6, 0, 0, 0, 0]);
        expect(reporter.cases.filter(row => row.point === 0).map(row => row.index)).toEqual([1, 2, 3, 4]);
    });
    it("keeps legacy extra scenarios at point zero and never serializes test names or diagnostic payloads", () => {
        const reporter = new ValidationEvidenceReporter();
        reporter.onTestCaseResult(task("7. Synthetic legacy patient/token/clinical payload must be omitted"));
        expect(reporter.cases).toEqual([{ point: 0, index: 1, state: "passed", durationMs: 1 }]);
        expect(Object.keys(reporter.cases[0]).sort()).toEqual(["durationMs", "index", "point", "state"]);
    });
});
