import crypto from "crypto";

// Keep historical results intact while separating newly generated English content.
export const CLINICAL_CONTENT_POLICY_VERSION = "english-reference-v1";

export function makeDiagnosisFingerprint({ diagnosis, patient, model }) {
    return crypto
        .createHash("sha256")
        .update(JSON.stringify({ diagnosis, patient, model, contentPolicy: CLINICAL_CONTENT_POLICY_VERSION }))
        .digest("hex");
}
