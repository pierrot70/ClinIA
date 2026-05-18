export async function buildMockAnalyzeResponse({
    diagnosisSeed,
    diagnosis,
    fingerprint,
    patient,
    neutralizationMeta,
    getMockForDiagnosis,
    normalizeClinicalAnalysis,
    persistOrReuseDiagnosis,
}) {
    const mock = getMockForDiagnosis(diagnosisSeed || diagnosis);
    const analysis = normalizeClinicalAnalysis(mock, {
        model: "mock",
        primaryConcern: diagnosis,
    });

    const persist = await persistOrReuseDiagnosis({
        fingerprint,
        input: patient,
        output: analysis,
        mode: "mock",
        model: "mock",
    });

    if (!persist.ok) {
        return { ok: false, error: persist.error };
    }

    return {
        ok: true,
        responsePayload: {
            data: persist.doc.output,
            meta: {
                source: "mock",
                model: "mock",
                ...neutralizationMeta,
            },
        },
    };
}

export function buildDegradedAnalyzeResponse({
    diagnosis,
    neutralizationMeta,
    normalizeClinicalAnalysis,
}) {
    const degraded = normalizeClinicalAnalysis(
        {},
        {
            model: "fallback",
            primaryConcern: diagnosis,
        }
    );

    return {
        data: degraded,
        meta: {
            source: "degraded",
            model: "fallback",
            ...neutralizationMeta,
        },
    };
}

export async function buildPersistedRealAnalyzeResponse({
    fingerprint,
    patient,
    normalized,
    model,
    forceRealSafe,
    neutralizationMeta,
    persistOrReuseDiagnosis,
    logger = console,
}) {
    const persist = await persistOrReuseDiagnosis({
        fingerprint,
        input: patient,
        output: normalized,
        mode: "real",
        model: model ?? "unknown",
        replaceExisting: forceRealSafe,
    });

    logger.log("AI_RESPONSE From OpenAI", {
        model,
        source: "real",
        hasDiagnosis: Boolean(normalized?.diagnosis?.suspected),
    });

    if (!persist.ok) {
        return { ok: false, error: persist.error };
    }

    const responsePayload = {
        data: persist.doc.output,
        meta: {
            source: "real",
            model,
            ...neutralizationMeta,
        },
    };

    logger.log(
        "=== RESPONSE TO FRONTEND ===\n",
        JSON.stringify(responsePayload, null, 2),
        "\n============================"
    );

    return { ok: true, responsePayload };
}
