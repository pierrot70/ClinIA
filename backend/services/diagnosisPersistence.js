import { DiagnosisResult } from "../models/DiagnosisResult.js";

export async function persistOrReuseDiagnosis(payload, deps = {}) {
    const {
        isPlaceholderClinicalAnalysis = () => false,
        logger = console,
    } = deps;

    try {
        const created = await DiagnosisResult.create(payload);
        return { ok: true, doc: created };
    } catch (err) {
        if (err.code === 11000) {
            const existing = await DiagnosisResult.findOne({
                fingerprint: payload.fingerprint,
            });

            if (existing) {
                const existingIsPlaceholderReal =
                    existing.mode === "real" &&
                    isPlaceholderClinicalAnalysis(existing.output);
                const incomingIsMeaningfulReal =
                    payload.mode === "real" &&
                    !isPlaceholderClinicalAnalysis(payload.output);
                const shouldReplaceExistingReal =
                    payload.mode === "real" &&
                    existing.mode === "real" &&
                    payload.replaceExisting === true;

                if (
                    (payload.mode === "real" && existing.mode === "mock") ||
                    (existingIsPlaceholderReal && incomingIsMeaningfulReal) ||
                    shouldReplaceExistingReal
                ) {
                    if (payload.archiveExistingAsDeleted === true) {
                        existing.history = Array.isArray(existing.history)
                            ? existing.history
                            : [];
                        existing.history.push({
                            status: "DELETE",
                            archivedAt: new Date(),
                            archivedBy: {
                                userId: payload.archivedBy?.userId ?? null,
                                username: payload.archivedBy?.username ?? null,
                                role: payload.archivedBy?.role ?? null,
                            },
                            input: existing.input,
                            output: existing.output,
                            mode: existing.mode,
                            model: existing.model,
                        });
                    }

                    existing.input = payload.input;
                    existing.output = payload.output;
                    existing.mode = payload.mode;
                    existing.model = payload.model;
                    await existing.save();
                    return { ok: true, doc: existing.toObject() };
                }

                return { ok: true, doc: existing.toObject() };
            }
        }

        logger.error("❌ Mongo persist error:", err.message);
        return {
            ok: false,
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Analyse générée mais sauvegarde impossible.",
                retryable: false,
            },
        };
    }
}

export async function findPersistedDiagnosisByFingerprint(fingerprint, deps = {}) {
    const { logger = console } = deps;

    try {
        return await DiagnosisResult.findOne({ fingerprint }).lean();
    } catch (err) {
        logger.error("❌ Mongo lookup error:", err.message);
        return null;
    }
}

export async function upgradePersistedDiagnosisOutput(
    fingerprint,
    normalizedOutput,
    deps = {}
) {
    const { logger = console } = deps;

    try {
        await DiagnosisResult.updateOne(
            { fingerprint },
            { $set: { output: normalizedOutput } }
        );
        return true;
    } catch (err) {
        logger.warn("⚠️ AI cache upgrade failed", err?.message);
        return false;
    }
}
