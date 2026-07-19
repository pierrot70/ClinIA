import express from "express";
import { requireRole } from "../middleware/requireRole.js";
import { AUTH_ROLES } from "../auth/constants.js";
import {
    createPatient,
    listPatients,
    listPatientAuditLogs,
    listPatientSecureRequestDocuments,
    listPatientClinicalNoteVersions,
    getPatientById,
    updatePatient,
    updatePatientWithClinicalNoteHistory,
    restorePatientClinicalNoteVersion,
    archivePatient,
    restorePatient,
} from "../services/patients.js";
import {
    toCreatePatientDTO,
    toArchivePatientDTO,
    toRestorePatientDTO,
    toUpdatePatientDTO,
} from "../dto/patient.dto.js";
import { recordPatientAuditEvent } from "../audit/patientAudit.js";
import { recordWriteOperationAuditEvent } from "../audit/writeOperationAudit.js";
import { getRequestContext } from "../app/requestContext.js";
import { CLINICAL_WRITE_CONCERN } from "../db/clinicalWriteConcern.js";
import { getReplicaSetStatus } from "../services/dbStatus.js";
import {
    buildWriteVerificationMeta,
    createWriteVerificationContext,
} from "../audit/writeVerification.js";
import { getSafeRequestPath } from "../utils/requestLogSafety.js";

const router = express.Router();

function getRequestIp(req) {
    const forwardedFor = req.headers?.["x-forwarded-for"];

    if (typeof forwardedFor === "string" && forwardedFor.trim()) {
        return forwardedFor.split(",")[0].trim();
    }

    return req.ip || null;
}

async function recordPatientMutationAudit(req, {
    action,
    operation,
    patientId,
    changedFields = [],
    context = null,
    clinicalNoteVersion = null,
}) {
    const requestContext = getRequestContext(req);
    const ip = getRequestIp(req);
    const requestPath = getSafeRequestPath(req);
    const { verificationId, clientMutationId } =
        createWriteVerificationContext(req);

    const patientAuditLog = await recordPatientAuditEvent({
        action,
        outcome: "SUCCESS",
        actorUserId: req.auth?.userId ?? null,
        actorUsername: req.auth?.username ?? null,
        actorRole: req.auth?.role ?? null,
        ip,
        patientId,
        changedFields,
        requestPath,
        context,
    });

    const replicaSet = await getReplicaSetStatus();

    if (clinicalNoteVersion) {
        await recordWriteOperationAuditEvent({
            collectionName: "patientclinicalnoteversions",
            operation: "CREATE",
            outcome: "SUCCESS",
            verificationId,
            clientMutationId,
            actorUserId: req.auth?.userId ?? null,
            actorUsername: req.auth?.username ?? null,
            actorRole: req.auth?.role ?? null,
            ip,
            requestId: requestContext.requestId,
            instanceId: requestContext.instanceId,
            resourceId: String(clinicalNoteVersion._id),
            patientId: patientId ? String(patientId) : null,
            changedFields: ["version", "contentHash", "changeType"],
            requestPath,
            writeConcern: CLINICAL_WRITE_CONCERN,
            replicaSet,
        });
    }

    await recordWriteOperationAuditEvent({
        collectionName: "patientauditlogs",
        operation: "CREATE",
        outcome: "SUCCESS",
        verificationId,
        clientMutationId,
        actorUserId: req.auth?.userId ?? null,
        actorUsername: req.auth?.username ?? null,
        actorRole: req.auth?.role ?? null,
        ip,
        requestId: requestContext.requestId,
        instanceId: requestContext.instanceId,
        resourceId: patientAuditLog?._id ? String(patientAuditLog._id) : null,
        patientId: patientId ? String(patientId) : null,
        changedFields: [
            "action",
            "outcome",
            "actorUserId",
            "actorUsernameMasked",
            "actorRole",
            "patientId",
            "changedFields",
            "requestPath",
            "context",
        ],
        requestPath,
        writeConcern: CLINICAL_WRITE_CONCERN,
        replicaSet,
    });

    const writeAuditRecorded = await recordWriteOperationAuditEvent({
        collectionName: "patients",
        operation,
        outcome: "SUCCESS",
        verificationId,
        clientMutationId,
        actorUserId: req.auth?.userId ?? null,
        actorUsername: req.auth?.username ?? null,
        actorRole: req.auth?.role ?? null,
        ip,
        requestId: requestContext.requestId,
        instanceId: requestContext.instanceId,
        resourceId: patientId ? String(patientId) : null,
        patientId: patientId ? String(patientId) : null,
        changedFields,
        requestPath,
        writeConcern: CLINICAL_WRITE_CONCERN,
        replicaSet,
    });

    return buildWriteVerificationMeta({
        writeAuditRecorded,
        verificationId,
        clientMutationId,
    });
}

async function buildClinicalNoteTransactionAudit(req, {
    action,
    operation,
    changedFields,
    context = null,
}) {
    const requestContext = getRequestContext(req);
    const { verificationId, clientMutationId } =
        createWriteVerificationContext(req);

    return {
        action,
        operation,
        verificationId,
        clientMutationId,
        actorUserId: req.auth?.userId ?? null,
        actorUsername: req.auth?.username ?? null,
        actorRole: req.auth?.role ?? null,
        ip: getRequestIp(req),
        requestId: requestContext.requestId,
        instanceId: requestContext.instanceId,
        requestPath: getSafeRequestPath(req),
        changedFields,
        context,
        replicaSet: await getReplicaSetStatus(),
    };
}

function buildPatientAuditContext(dto) {
    const secureRequestProfile = dto?.secure_request_profile;

    if (!secureRequestProfile) {
        return null;
    }

    return {
        secureRequest: {
            objective: secureRequestProfile.objective ?? "",
            clinicalScope: secureRequestProfile.clinicalScope ?? "",
            selectedDocumentIds: Array.isArray(
                secureRequestProfile.selected_document_ids
            )
                ? secureRequestProfile.selected_document_ids
                : [],
        },
    };
}

function normalizeComparableValue(value) {
    if (value instanceof Date) {
        return value.toISOString();
    }

    if (value && typeof value === "object") {
        return JSON.stringify(value);
    }

    return value ?? null;
}

function getActuallyChangedPatientFields(before = {}, updates = {}, after = null) {
    return Object.keys(updates).filter((field) => {
        const beforeValue = normalizeComparableValue(before?.[field]);
        const afterValue = normalizeComparableValue(after?.[field] ?? updates[field]);
        return beforeValue !== afterValue;
    });
}

function buildPatientConflictMessage(err) {
    const conflictFields = [
        ...Object.keys(err?.keyPattern ?? {}),
        ...Object.keys(err?.keyValue ?? {}),
    ];
    const uniqueFields = new Set(conflictFields);

    if (uniqueFields.has("telephone")) {
        return "Ce numéro de téléphone existe déjà.";
    }

    if (
        uniqueFields.has("num_assurance_maladie") ||
        uniqueFields.has("healthInsuranceJurisdiction") ||
        uniqueFields.has("healthInsuranceNumberSearch")
    ) {
        return "Ce numéro d'assurance maladie existe déjà.";
    }

    return "Un patient existe déjà avec une valeur unique identique.";
}

function sendPatientConflict(res, err) {
    return res.status(409).json({
        error: {
            code: "PATIENT_CONFLICT",
            message: buildPatientConflictMessage(err),
            retryable: false,
        },
    });
}

/* ------------------------------------------------------------------ */
/* POST /api/patients                                                  */
/* ------------------------------------------------------------------ */

router.post("/", async (req, res) => {
    const dto = toCreatePatientDTO(req.body);

    if (!dto.nom || !dto.prenom) {
        return res.status(400).json({
            error: {
                code: "INVALID_INPUT",
                message:
                    "Champs requis manquants (nom, prenom).",
                retryable: false,
            },
        });
    }

    try {
        const patient = await createPatient(dto, req.auth, {
            allowPotentialDuplicate:
                (req.get?.("X-Confirm-Potential-Duplicate") ||
                    req.headers?.["x-confirm-potential-duplicate"]) === "true",
        });

        const writeVerification = await recordPatientMutationAudit(req, {
            action: "PATIENT_CREATE",
            operation: "CREATE",
            patientId: patient?._id ?? null,
            changedFields: Object.keys(dto),
        });

        return res.status(201).json({
            data: patient,
            meta: {
                source: "real",
                model: "mongo",
                writeVerification,
            },
        });
    } catch (err) {
        if (err.code === "RAMQ_GENERATION_FAILED") {
            return res.status(500).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: true,
                },
            });
        }

        if (err.code === 11000) {
            return sendPatientConflict(res, err);
        }

        if (err.code === "POTENTIAL_DUPLICATE") {
            return res.status(409).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                    action: "CONFIRM_POTENTIAL_DUPLICATE",
                },
            });
        }

        console.error("❌ Patient create error:", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible d’enregistrer le patient.",
                retryable: true,
            },
        });
    }
});

/* ------------------------------------------------------------------ */
/* GET /api/patients (PAGINATION BACKEND)                              */
/* ------------------------------------------------------------------ */

router.get("/", async (req, res) => {
    try {
        const { data, meta } = await listPatients(
            {
                q: req.query.q,
                nom: req.query.nom,
                prenom: req.query.prenom,
                num_assurance_maladie:
                    req.query.num_assurance_maladie,
                telephone: req.query.telephone,
                addresse: req.query.addresse,
            },
            {
                page: req.query.page,
                limit: req.query.limit,
                sortBy: req.query.sortBy,
                sortDir: req.query.sortDir,
                archiveStatus: req.query.archiveStatus,
            },
            req.auth
        );

        return res.status(200).json({
            data: {
                data,
                meta: {
                    ...meta,
                    source: "real",
                    model: "mongo",
                },
            },
            meta: {
                source: "real",
                model: "mongo",
            },
        });
    } catch (err) {
        console.error("❌ Patient list error:", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible de récupérer les patients.",
                retryable: true,
            },
        });
    }
});

/* ------------------------------------------------------------------ */
/* GET /api/patients/audit-logs                                        */
/* ------------------------------------------------------------------ */

router.get(
    "/audit-logs",
    requireRole(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPERADMIN),
    async (req, res) => {
        try {
            const data = await listPatientAuditLogs({
                authUser: req.auth,
                page: req.query.page,
                limit: req.query.limit,
                action: req.query.action,
                patientId: req.query.patientId,
                actorUserId: req.query.actorUserId,
                startDate: req.query.startDate,
                endDate: req.query.endDate,
            });

            return res.status(200).json({
                data,
                meta: {
                    source: "real",
                    model: "mongo",
                },
            });
        } catch (err) {
            if (err.code === "FORBIDDEN") {
                return res.status(403).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            if (err.code === "INVALID_INPUT") {
                return res.status(400).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            console.error("❌ Patient audit list error:", err);

            return res.status(500).json({
                error: {
                    code: "PERSISTENCE_FAILED",
                    message:
                        "Impossible de recuperer les audits patient.",
                    retryable: true,
                },
            });
        }
    }
);

/* ------------------------------------------------------------------ */
/* GET /api/patients/:id/secure-request-documents                      */
/* ------------------------------------------------------------------ */

router.get("/:id/secure-request-documents", async (req, res) => {
    try {
        const documents = await listPatientSecureRequestDocuments(
            req.params.id,
            req.auth
        );

        return res.status(200).json({
            data: documents,
            meta: {
                source: "real",
                model: "mongo",
            },
        });
    } catch (err) {
        if (err.code === "INVALID_ID") {
            return res.status(400).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        if (err.code === "NOT_FOUND") {
            return res.status(404).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        if (err.code === "PATIENT_ARCHIVED") {
            return res.status(409).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        console.error("❌ Patient secure request documents error:", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible de recuperer les documents de requete securisee du patient.",
                retryable: true,
            },
        });
    }
});

router.get("/:id/clinical-note-versions", async (req, res) => {
    try {
        const versions = await listPatientClinicalNoteVersions(req.params.id, req.auth);
        return res.status(200).json({
            data: versions,
            meta: { source: "real", model: "mongo" },
        });
    } catch (err) {
        if (["INVALID_ID", "NOT_FOUND"].includes(err.code)) {
            return res.status(err.code === "NOT_FOUND" ? 404 : 400).json({
                error: { code: err.code, message: err.message, retryable: false },
            });
        }
        console.error("Patient clinical note versions error:", err);
        return res.status(500).json({
            error: { code: "PERSISTENCE_FAILED", message: "Impossible de recuperer les versions de note.", retryable: true },
        });
    }
});

router.post("/:id/clinical-note-versions/:versionId/restore", async (req, res) => {
    try {
        const transactionAudit = await buildClinicalNoteTransactionAudit(req, {
            action: "PATIENT_UPDATE",
            operation: "UPDATE",
            changedFields: ["secure_request_profile.clinicalNotes"],
            context: {
                clinicalNoteVersion: {
                    changeType: "RESTORE",
                    restoredFromVersionId: req.params.versionId,
                },
            },
        });
        const { patient, noteVersion, writeVerification } = await restorePatientClinicalNoteVersion(
            req.params.id,
            req.params.versionId,
            req.auth,
            { audit: transactionAudit }
        );
        return res.status(200).json({
            data: patient,
            meta: { source: "real", model: "mongo", writeVerification },
        });
    } catch (err) {
        if (["INVALID_ID", "NOT_FOUND", "INVALID_INPUT"].includes(err.code)) {
            return res.status(err.code === "NOT_FOUND" ? 404 : 400).json({
                error: { code: err.code, message: err.message, retryable: false },
            });
        }
        console.error("Patient clinical note restore error:", err);
        return res.status(500).json({
            error: { code: "PERSISTENCE_FAILED", message: "Impossible de restaurer cette version de note.", retryable: true },
        });
    }
});

/* ------------------------------------------------------------------ */
/* GET /api/patients/:id                                               */
/* ------------------------------------------------------------------ */

router.get("/:id", async (req, res) => {
    try {
        const patient = await getPatientById(req.params.id, req.auth);

        return res.status(200).json({
            data: patient,
            meta: {
                source: "real",
                model: "mongo",
            },
        });
    } catch (err) {
        if (err.code === "INVALID_ID") {
            return res.status(400).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        if (err.code === "NOT_FOUND") {
            return res.status(404).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        console.error("❌ Patient get error:", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible de récupérer le patient.",
                retryable: true,
            },
        });
    }
});

/* ------------------------------------------------------------------ */
/* PATCH /api/patients/:id                                             */
/* ------------------------------------------------------------------ */

router.patch("/:id", async (req, res) => {
    const dto = toUpdatePatientDTO(req.body);

    if (Object.keys(dto).length === 0) {
        return res.status(400).json({
            error: {
                code: "INVALID_INPUT",
                message:
                    "Aucun champ valide fourni pour la mise à jour.",
                retryable: false,
            },
        });
    }

    try {
        const beforePatient = await getPatientById(req.params.id, req.auth);
        const clinicalNotesChanged =
            dto.secure_request_profile !== undefined &&
            (beforePatient.secure_request_profile?.clinicalNotes || "") !==
                (dto.secure_request_profile?.clinicalNotes || "");
        const noteChangedFields = Object.keys(dto).map((field) =>
            field === "secure_request_profile"
                ? "secure_request_profile.clinicalNotes"
                : field
        );
        const transactionAudit = clinicalNotesChanged
            ? await buildClinicalNoteTransactionAudit(req, {
                action: "PATIENT_UPDATE",
                operation: "UPDATE",
                changedFields: noteChangedFields,
                context: buildPatientAuditContext(dto),
            })
            : null;
        const result = clinicalNotesChanged
            ? await updatePatientWithClinicalNoteHistory(req.params.id, dto, req.auth, {
                audit: transactionAudit,
            })
            : { patient: await updatePatient(req.params.id, dto, req.auth), noteVersion: null };
        const { patient, noteVersion } = result;
        const changedFields = getActuallyChangedPatientFields(
            beforePatient,
            dto,
            patient
        );

        const writeVerification = noteVersion
            ? result.writeVerification
            : await recordPatientMutationAudit(req, {
            action: "PATIENT_UPDATE",
            operation: "UPDATE",
            patientId: patient?._id ?? req.params.id,
            changedFields: noteVersion
                ? changedFields.map((field) => field === "secure_request_profile" ? "secure_request_profile.clinicalNotes" : field)
                : changedFields,
            context: {
                ...buildPatientAuditContext(dto),
                ...(noteVersion ? {
                    clinicalNoteVersion: {
                        version: noteVersion.version,
                        changeType: noteVersion.changeType,
                        versionId: String(noteVersion._id),
                    },
                } : {}),
            },
            clinicalNoteVersion: noteVersion,
        });

        return res.status(200).json({
            data: patient,
            meta: {
                source: "real",
                model: "mongo",
                writeVerification,
            },
        });
    } catch (err) {
        if (
            err.code === "INVALID_ID" ||
            err.code === "INVALID_INPUT"
        ) {
            return res.status(400).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        if (err.code === "NOT_FOUND") {
            return res.status(404).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        if (err.code === "PATIENT_ARCHIVED") {
            return res.status(409).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        if (err.code === 11000) {
            return sendPatientConflict(res, err);
        }

        console.error("❌ Patient update error:", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible de mettre à jour le patient.",
                retryable: true,
            },
        });
    }
});

/* ------------------------------------------------------------------ */
/* DELETE /api/patients/:id - archive, never physical deletion         */
/* ------------------------------------------------------------------ */

router.delete(
    "/:id",
    requireRole(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPERADMIN),
    async (req, res) => {
        try {
            const { reason } = toArchivePatientDTO(req.body);
            const archived = await archivePatient(req.params.id, reason, req.auth);

            const writeVerification = await recordPatientMutationAudit(req, {
                action: "PATIENT_ARCHIVE",
                operation: "UPDATE",
                patientId: archived?._id ?? req.params.id,
                changedFields: ["archivedAt", "archivedByUserId", "archiveReason"],
            });

            return res.status(200).json({
                data: archived,
                meta: {
                    source: "real",
                    model: "mongo",
                    writeVerification,
                },
            });
        } catch (err) {
            if (["INVALID_ID", "INVALID_INPUT"].includes(err.code)) {
                return res.status(400).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            if (err.code === "NOT_FOUND") {
                return res.status(404).json({
                    error: {
                        code: err.code,
                        message: err.message,
                        retryable: false,
                    },
                });
            }

            console.error("❌ Patient archive error:", err);

            return res.status(500).json({
                error: {
                    code: "PERSISTENCE_FAILED",
                    message:
                        "Impossible d'archiver le patient.",
                    retryable: true,
                },
            });
        }
    }
);

/* ------------------------------------------------------------------ */
/* POST /api/patients/:id/restore - controlled reactivation            */
/* ------------------------------------------------------------------ */

router.post(
    "/:id/restore",
    requireRole(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPERADMIN),
    async (req, res) => {
        try {
            const { reason } = toRestorePatientDTO(req.body);
            const restored = await restorePatient(req.params.id, reason, req.auth);

            const writeVerification = await recordPatientMutationAudit(req, {
                action: "PATIENT_RESTORE",
                operation: "UPDATE",
                patientId: restored?._id ?? req.params.id,
                changedFields: ["archivedAt", "archivedByUserId", "archiveReason"],
            });

            return res.status(200).json({
                data: restored,
                meta: {
                    source: "real",
                    model: "mongo",
                    writeVerification,
                },
            });
        } catch (err) {
            if (["INVALID_ID", "INVALID_INPUT"].includes(err.code)) {
                return res.status(400).json({
                    error: { code: err.code, message: err.message, retryable: false },
                });
            }

            if (err.code === "NOT_FOUND") {
                return res.status(404).json({
                    error: { code: err.code, message: err.message, retryable: false },
                });
            }

            console.error("❌ Patient restore error:", err);
            return res.status(500).json({
                error: {
                    code: "PERSISTENCE_FAILED",
                    message: "Impossible de réactiver le patient.",
                    retryable: true,
                },
            });
        }
    }
);

export default router;
