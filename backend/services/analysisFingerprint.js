import crypto from "crypto";

export function makeDiagnosisFingerprint({ diagnosis, patient, model }) {
    return crypto
        .createHash("sha256")
        .update(JSON.stringify({ diagnosis, patient, model }))
        .digest("hex");
}
