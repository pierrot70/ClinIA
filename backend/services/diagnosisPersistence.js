import { DiagnosisResult } from "../models/DiagnosisResult.js";
import { CLINICAL_QUERY_WRITE_OPTIONS, CLINICAL_WRITE_CONCERN } from "../db/clinicalWriteConcern.js";
import { recordWriteOperationAuditEvent } from "../audit/writeOperationAudit.js";
import { getReplicaSetStatus } from "./dbStatus.js";

async function recordDiagnosisWriteAudit({
    operation,
    doc,
    writeAudit,
    changedFields,
}) {
    if (!writeAudit || !doc?._id) {
        return;
    }

    await recordWriteOperationAuditEvent({
        collectionName: "diagnosisresults",
        operation,
        outcome: "SUCCESS",
        actorUserId: writeAudit.actorUserId ?? null,
        actorUsername: writeAudit.actorUsername ?? null,
        actorRole: writeAudit.actorRole ?? null,
        ip: writeAudit.ip ?? null,
        requestId: writeAudit.requestId ?? null,
        instanceId: writeAudit.instanceId ?? null,
        resourceId: String(doc._id),
        changedFields,
        requestPath: writeAudit.requestPath ?? null,
        writeConcern: CLINICAL_WRITE_CONCERN,
        replicaSet: await getReplicaSetStatus(),
    });
}

export async function persistOrReuseDiagnosis(payload, deps = {}) {
    const {
        isPlaceholderClinicalAnalysis = () => false,
        logger = console,
    } = deps;
    const { writeAudit, ...diagnosisPayload } = payload;

    try {
        const [created] = await DiagnosisResult.create(
            [diagnosisPayload],
            CLINICAL_QUERY_WRITE_OPTIONS
        );
        await recordDiagnosisWriteAudit({
            operation: "CREATE",
            doc: created,
            writeAudit,
            changedFields: ["fingerprint", "input", "output", "mode", "model"],
        });
        return { ok: true, doc: created };
    } catch (err) {
        if (err.code === 11000) {
            const existing = await DiagnosisResult.findOne({
                fingerprint: diagnosisPayload.fingerprint,
            });

            if (existing) {
                const existingIsPlaceholderReal =
                    existing.mode === "real" &&
                    isPlaceholderClinicalAnalysis(existing.output);
                const incomingIsMeaningfulReal =
                    diagnosisPayload.mode === "real" &&
                    !isPlaceholderClinicalAnalysis(diagnosisPayload.output);
                const shouldReplaceExistingReal =
                    diagnosisPayload.mode === "real" &&
                    existing.mode === "real" &&
                    diagnosisPayload.replaceExisting === true;

                if (
                    (diagnosisPayload.mode === "real" && existing.mode === "mock") ||
                    (existingIsPlaceholderReal && incomingIsMeaningfulReal) ||
                    shouldReplaceExistingReal
                ) {
                    if (diagnosisPayload.archiveExistingAsDeleted === true) {
                        existing.history = Array.isArray(existing.history)
                            ? existing.history
                            : [];
                        existing.history.push({
                            status: "DELETE",
                            archivedAt: new Date(),
                            archivedBy: {
                                userId: diagnosisPayload.archivedBy?.userId ?? null,
                                username: diagnosisPayload.archivedBy?.username ?? null,
                                role: diagnosisPayload.archivedBy?.role ?? null,
                            },
                            input: existing.input,
                            output: existing.output,
                            mode: existing.mode,
                            model: existing.model,
                        });
                    }

                    existing.input = diagnosisPayload.input;
                    existing.output = diagnosisPayload.output;
                    existing.mode = diagnosisPayload.mode;
                    existing.model = diagnosisPayload.model;
                    await existing.save(CLINICAL_WRITE_CONCERN);
                    await recordDiagnosisWriteAudit({
                        operation: "UPDATE",
                        doc: existing,
                        writeAudit,
                        changedFields: [
                            "input",
                            "output",
                            "mode",
                            "model",
                            ...(diagnosisPayload.archiveExistingAsDeleted === true ? ["history"] : []),
                        ],
                    });
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
    const { logger = console, writeAudit = null } = deps;

    try {
        const result = await DiagnosisResult.updateOne(
            { fingerprint },
            { $set: { output: normalizedOutput } },
            CLINICAL_QUERY_WRITE_OPTIONS
        );
        if (result.modifiedCount > 0 && writeAudit) {
            const updated = await DiagnosisResult.findOne({ fingerprint }).lean();
            await recordDiagnosisWriteAudit({
                operation: "UPDATE",
                doc: updated,
                writeAudit,
                changedFields: ["output"],
            });
        }
        return true;
    } catch (err) {
        logger.warn("⚠️ AI cache upgrade failed", err?.message);
        return false;
    }
}
