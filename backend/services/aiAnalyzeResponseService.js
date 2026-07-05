export async function buildMockAnalyzeResponse({
    diagnosisSeed,
    diagnosis,
    fingerprint,
    patient,
    neutralizationMeta,
    getMockForDiagnosis,
    normalizeClinicalAnalysis,
    persistOrReuseDiagnosis,
    writeAudit,
    writeVerification = null,
    reverifyRequested = false,
    reqAuth = null,
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
        replaceExisting: reverifyRequested,
        archiveExistingAsDeleted: reverifyRequested,
        archivedBy: reverifyRequested
            ? {
                  userId: reqAuth?.userId ?? null,
                  username: reqAuth?.username ?? null,
                  role: reqAuth?.role ?? null,
              }
            : undefined,
        writeAudit,
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
                ...(reverifyRequested === true ? { reverified: true } : {}),
                ...(writeVerification
                    ? {
                          writeVerification: {
                              status: persist.writeAuditRecorded ? "CONFIRMED" : "UNAVAILABLE",
                              verificationId: persist.writeAuditRecorded
                                  ? writeVerification.verificationId
                                  : null,
                              clientMutationId: writeVerification.clientMutationId,
                          },
                      }
                    : {}),
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
    reverifyRequested = false,
    reqAuth,
    neutralizationMeta,
    persistOrReuseDiagnosis,
    writeAudit,
    writeVerification = null,
    logger = console,
}) {
    const persist = await persistOrReuseDiagnosis({
        fingerprint,
        input: patient,
        output: normalized,
        mode: "real",
        model: model ?? "unknown",
        replaceExisting: forceRealSafe || reverifyRequested,
        archiveExistingAsDeleted: reverifyRequested,
        archivedBy: reverifyRequested
            ? {
                  userId: reqAuth?.userId ?? null,
                  username: reqAuth?.username ?? null,
                  role: reqAuth?.role ?? null,
              }
            : undefined,
        writeAudit,
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
            ...(reverifyRequested === true ? { reverified: true } : {}),
            ...(writeVerification
                ? {
                      writeVerification: {
                          status: persist.writeAuditRecorded ? "CONFIRMED" : "UNAVAILABLE",
                          verificationId: persist.writeAuditRecorded
                              ? writeVerification.verificationId
                              : null,
                          clientMutationId: writeVerification.clientMutationId,
                      },
                  }
                : {}),
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
