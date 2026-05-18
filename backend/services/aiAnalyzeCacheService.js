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

    const normalizedCachedOutput = cachedDiagnosis?.output
        ? normalizeClinicalAnalysis(cachedDiagnosis.output, {
            model: cachedDiagnosis.model ?? model ?? "cache",
            primaryConcern: cachedPrimaryConcern,
        })
        : null;

    const cachedDiagnosisIsPlaceholderReal =
        cachedDiagnosis?.mode === "real" &&
        isPlaceholderClinicalAnalysis(normalizedCachedOutput);

    const canReuseCachedDiagnosis =
        normalizedCachedOutput &&
        !cachedDiagnosisIsPlaceholderReal &&
        !(forceRealSafe && cachedDiagnosis?.mode === "real") &&
        (cachedDiagnosis.mode !== "mock" || useMock);

    const cacheNeedsUpgrade =
        canReuseCachedDiagnosis &&
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
