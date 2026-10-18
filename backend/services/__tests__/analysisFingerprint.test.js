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
    expect(CLINICAL_CONTENT_POLICY_VERSION).toBe("english-reference-v1");
    expect(makeDiagnosisFingerprint(input)).not.toBe(legacy);
    expect(makeDiagnosisFingerprint(input)).toBe(makeDiagnosisFingerprint(input));
});
