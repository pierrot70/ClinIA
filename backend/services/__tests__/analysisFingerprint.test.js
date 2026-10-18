import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

import { makeDiagnosisFingerprint, CLINICAL_CONTENT_POLICY_VERSION } from "../analysisFingerprint.js";

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


it("does not reuse legacy analysis fingerprints after the English reference policy change", () => {
    const input = { diagnosis: "Hypertension", patient: { symptoms: ["headache"] }, model: "mock" };
    const legacy = crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
    expect(CLINICAL_CONTENT_POLICY_VERSION).toBe("english-reference-v3");
    expect(makeDiagnosisFingerprint(input)).not.toBe(legacy);
    expect(makeDiagnosisFingerprint(input)).toBe(makeDiagnosisFingerprint(input));
});


it.each(["english-reference-v1", "english-reference-v2"])("separates corrected content from cached %s results without modifying input", previousPolicy => {
    const input = { diagnosis: "Type 2 diabetes", patient: { symptoms: ["Polydipsia", "Polyuria", "Fatigue"] }, model: "mock" };
    const snapshot = JSON.stringify(input);
    const previous = crypto.createHash("sha256").update(JSON.stringify({ ...input, contentPolicy: previousPolicy })).digest("hex");
    expect(makeDiagnosisFingerprint(input)).not.toBe(previous);
    expect(JSON.stringify(input)).toBe(snapshot);
});
