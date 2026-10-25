import { withholdUnverifiedDiabetesSummaries } from "../utils/clinicalSummarySafety.js";

const NON_CLINICAL_FINGERPRINT_KEYS = new Set([
    "forceReal",
    "openaiModel",
    "incidentAckId",
    "reverifyRequested",
    "clientMutationId",
]);

export function buildFingerprintPatientPayload(patient = {}) {
    if (!patient || typeof patient !== "object" || Array.isArray(patient)) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(patient).filter(
            ([key]) => !NON_CLINICAL_FINGERPRINT_KEYS.has(key)
        )
    );
}

export function resolveCachedDiagnosisState({
    cachedDiagnosis,
    model,
    forceRealSafe,
    useMock,
    extractPrimaryClinicalConcern,
    normalizeClinicalAnalysis,
    isPlaceholderClinicalAnalysis,
}) {
    const cachedPrimaryConcern = extractPrimaryClinicalConcern({
        diagnosis: cachedDiagnosis?.input?.diagnosis,
        symptoms: cachedDiagnosis?.input?.symptoms,
    });

    const normalizedStoredOutput = cachedDiagnosis?.output
        ? normalizeClinicalAnalysis(cachedDiagnosis.output, {
            model: cachedDiagnosis.model ?? model ?? "cache",
            primaryConcern: cachedPrimaryConcern,
        })
        : null;

    const normalizedCachedSource = cachedDiagnosis?.output
        ? normalizeClinicalAnalysis(cachedDiagnosis.output, {
            model: cachedDiagnosis.model ?? model ?? "cache",
            primaryConcern: cachedPrimaryConcern,
            repairLegacyDerivedTreatments: true,
        })
        : null;
    const normalizedCachedOutput = withholdUnverifiedDiabetesSummaries(normalizedCachedSource, {
        patient: { ...cachedDiagnosis?.input, diagnosis: cachedPrimaryConcern },
        source: cachedDiagnosis?.mode,
    });
    const summaryWithheld = normalizedCachedOutput?.summary_safety?.status === "withheld";
    const repairedLegacyReplay = JSON.stringify(normalizedStoredOutput) !== JSON.stringify(normalizedCachedSource);

    const cachedDiagnosisIsPlaceholderReal =
        cachedDiagnosis?.mode === "real" &&
        isPlaceholderClinicalAnalysis(normalizedCachedSource);

    const canReuseCachedDiagnosis =
        normalizedCachedOutput &&
        !cachedDiagnosisIsPlaceholderReal &&
        (cachedDiagnosis.mode !== "mock" || useMock);

    const cacheNeedsUpgrade =
        canReuseCachedDiagnosis &&
        // Replay repairs must not rewrite the historical stored analysis.
        !repairedLegacyReplay &&
        !summaryWithheld &&
        JSON.stringify(cachedDiagnosis.output) !==
            JSON.stringify(normalizedCachedOutput);

    return {
        cachedPrimaryConcern,
        normalizedCachedOutput,
        cachedDiagnosisIsPlaceholderReal,
        canReuseCachedDiagnosis,
        cacheNeedsUpgrade,
    };
}
