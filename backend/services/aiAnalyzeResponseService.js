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
    persist = true,
}) {
    const mock = getMockForDiagnosis(diagnosisSeed || diagnosis);
    const analysis = normalizeClinicalAnalysis(mock, {
        model: "mock",
        primaryConcern: diagnosis,
    });

    if (!persist) {
        return {
            ok: true,
            responsePayload: {
                data: analysis,
                meta: {
                    source: "mock",
                    model: "mock",
                    ephemeral: true,
                    ...neutralizationMeta,
                },
            },
        };
    }

    const persisted = await persistOrReuseDiagnosis({
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

    if (!persisted.ok) {
        return { ok: false, error: persisted.error };
    }

    return {
        ok: true,
        responsePayload: {
            data: persisted.doc.output,
            meta: {
                source: "mock",
                model: "mock",
                ...(reverifyRequested === true ? { reverified: true } : {}),
                ...(writeVerification
                    ? {
                          writeVerification: {
                              status: persisted.writeAuditRecorded
                                  ? "CONFIRMED"
                                  : "UNAVAILABLE",
                              verificationId: persisted.writeAuditRecorded
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
    persist = true,
}) {
    if (!persist) {
        return {
            ok: true,
            responsePayload: {
                data: normalized,
                meta: {
                    source: "real",
                    model,
                    ephemeral: true,
                    ...neutralizationMeta,
                },
            },
        };
    }

    const persisted = await persistOrReuseDiagnosis({
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

    if (!persisted.ok) {
        return { ok: false, error: persisted.error };
    }

    const responsePayload = {
        data: persisted.doc.output,
        meta: {
            source: "real",
            model,
            ...(reverifyRequested === true ? { reverified: true } : {}),
            ...(writeVerification
                ? {
                      writeVerification: {
                          status: persisted.writeAuditRecorded ? "CONFIRMED" : "UNAVAILABLE",
                          verificationId: persisted.writeAuditRecorded
                              ? writeVerification.verificationId
                              : null,
                          clientMutationId: writeVerification.clientMutationId,
                      },
                  }
                : {}),
            ...neutralizationMeta,
        },
    };

    logger.log("AI_RESPONSE_READY", {
        source: "real",
        model,
        responseBytes: Buffer.byteLength(JSON.stringify(responsePayload), "utf8"),
                writeVerificationRecorded: Boolean(persisted.writeAuditRecorded),
    });

    return { ok: true, responsePayload };
}
