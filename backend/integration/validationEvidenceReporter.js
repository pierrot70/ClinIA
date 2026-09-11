import { writeFileSync } from "node:fs";

// Never serializes Vitest errors, task names, source paths, console or payloads.
export default class ValidationEvidenceReporter {
    cases = [];
    onTestCaseResult(test) {
        const point = Number(test.fullName.match(/^([1-6])\. /)?.[1] || 0);
        const state = test.result()?.state;
        this.cases.push({ point, index: this.cases.filter(c => c.point === point).length + 1,
            state: ["passed", "failed", "skipped", "pending"].includes(state) ? state : "pending",
            durationMs: Math.max(0, Math.round(test.diagnostic()?.duration || 0)) });
    }
    onTestRunEnd(_modules, errors) {
        writeFileSync(process.env.CLINIA_VALIDATION_RESULT_FILE, JSON.stringify({ cases: this.cases, unhandledErrors: errors.length }), { mode: 0o600 });
    }
}
