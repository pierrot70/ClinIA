import { describe, expect, it } from "vitest";

import { makeDiagnosisFingerprint } from "../analysisFingerprint.js";

describe("makeDiagnosisFingerprint", () => {
    it("produces distinct fingerprints for the same clinical input on different models", () => {
        const input = {
            diagnosis: "Migraine",
            patient: { age: 55, symptoms: ["Cephalee"] },
        };

        expect(
            makeDiagnosisFingerprint({ ...input, model: "gpt-4.1-mini" })
        ).not.toBe(
            makeDiagnosisFingerprint({ ...input, model: "gpt-4-0613" })
        );
    });
});
