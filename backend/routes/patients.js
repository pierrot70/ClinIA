import express from "express";
import { requireRole } from "../middleware/requireRole.js";
import { AUTH_ROLES } from "../auth/constants.js";
import {
    createPatientWithWriteVerification,
    listPatients,
    listPatientAuditLogs,
    listPatientSecureRequestDocuments,
    listPatientClinicalNoteVersions,
    getPatientById,
    updatePatientWithWriteVerification,
    updatePatientWithClinicalNoteHistory,
    restorePatientClinicalNoteVersion,
    archivePatientWithWriteVerification,
    restorePatientWithWriteVerification,
} from "../services/patients.js";
import {
    toCreatePatientDTO,
    toArchivePatientDTO,
    toRestorePatientDTO,
    toUpdatePatientDTO,
} from "../dto/patient.dto.js";
import { getRequestContext } from "../app/requestContext.js";
import { getReplicaSetStatus } from "../services/dbStatus.js";
import {
    createWriteVerificationContext,
} from "../audit/writeVerification.js";
import { getSafeRequestPath, logSafeError } from "../utils/requestLogSafety.js";
import { assessCloudClinicalPayload } from "../utils/requestSafety.js";
import { minimizePatientAuditContext } from "../audit/auditDataMinimization.js";
import { getTrustedRequestIp } from "../utils/requestIp.js";

const router = express.Router();

function getRequestIp(req) {
    return getTrustedRequestIp(req);
}

async function buildPatientWriteTransactionAudit(req, {
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

    return minimizePatientAuditContext({
        secureRequest: {
            objective: secureRequestProfile.objective ?? "",
            clinicalScope: secureRequestProfile.clinicalScope ?? "",
            selectedDocumentIds: Array.isArray(
                secureRequestProfile.selected_document_ids
            )
                ? secureRequestProfile.selected_document_ids
                : [],
        },
    });
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

function clinicalParametersFingerprint(parameters) {
    if (!parameters || typeof parameters !== "object") {
        return "";
    }

    const asString = (value) =>
        typeof value === "string" ? value.trim() : "";
    const asNumber = (value) =>
        Number.isFinite(value) ? Number(value) : null;
    const asList = (value) =>
        Array.isArray(value)
            ? value.filter((entry) => typeof entry === "string").map((entry) => entry.trim())
            : [];

    return JSON.stringify({
        age: asNumber(parameters.age),
        sex: asString(parameters.sex),
        country: asString(parameters.country),
        ethnicity: asString(parameters.ethnicity),
        diagnosis: asString(parameters.diagnosis),
        weight: asNumber(parameters.weight),
        height: asNumber(parameters.height),
        blood_pressure: {
            systolic: asNumber(parameters.blood_pressure?.systolic),
            diastolic: asNumber(parameters.blood_pressure?.diastolic),
        },
        symptoms: asList(parameters.symptoms),
        medical_history: asList(parameters.medical_history),
        current_medications: asList(parameters.current_medications),
        diabetes_context: {
            cardiovascular_risk: asString(parameters.diabetes_context?.cardiovascular_risk),
            renal_function: asString(parameters.diabetes_context?.renal_function),
            fragility: asString(parameters.diabetes_context?.fragility),
            tolerance: asString(parameters.diabetes_context?.tolerance),
            glycemic_goals: asString(parameters.diabetes_context?.glycemic_goals),
        },
    });
}

function rejectUnsafeClinicalAnalysisProfile(res, dto, existingPatient = null) {
    const clinicalParameters =
        dto?.secure_request_profile?.clinicalAnalysisParameters;

    if (!clinicalParameters) {
        return false;
    }

    const existingParameters =
        existingPatient?.secure_request_profile?.clinicalAnalysisParameters;
    if (
        existingPatient &&
        clinicalParametersFingerprint(clinicalParameters) ===
            clinicalParametersFingerprint(existingParameters)
    ) {
        return false;
    }

    const assessment = assessCloudClinicalPayload(clinicalParameters);
    if (assessment.rejectedFields.length === 0) {
        return false;
    }

    res.status(400).json({
        error: {
            code: "UNAPPROVED_CLINICAL_PROFILE_CONTENT",
            message:
                "Les paramètres cliniques contiennent du texte libre non approuvé. Ils n'ont pas été sauvegardés.",
            retryable: false,
            fields: assessment.rejectedFields,
        },
    });
    return true;
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

    if (rejectUnsafeClinicalAnalysisProfile(res, dto)) {
        return;
    }

    try {
        const transactionAudit = await buildPatientWriteTransactionAudit(req, {
            action: "PATIENT_CREATE",
            operation: "CREATE",
            changedFields: Object.keys(dto),
            context: buildPatientAuditContext(dto),
        });
        const { patient, writeVerification } =
            await createPatientWithWriteVerification(dto, req.auth, {
            allowPotentialDuplicate:
                (req.get?.("X-Confirm-Potential-Duplicate") ||
                    req.headers?.["x-confirm-potential-duplicate"]) === "true",
                audit: transactionAudit,
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

        logSafeError("PATIENT_CREATE_FAILED", err);

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
        logSafeError("PATIENT_LIST_FAILED", err);

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

            logSafeError("PATIENT_AUDIT_LIST_FAILED", err);

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

        logSafeError("PATIENT_SECURE_DOCUMENTS_FAILED", err);

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
        logSafeError("PATIENT_NOTE_VERSIONS_FAILED", err);
        return res.status(500).json({
            error: { code: "PERSISTENCE_FAILED", message: "Impossible de recuperer les versions de note.", retryable: true },
        });
    }
});

router.post("/:id/clinical-note-versions/:versionId/restore", async (req, res) => {
    try {
        const transactionAudit = await buildPatientWriteTransactionAudit(req, {
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
        logSafeError("PATIENT_NOTE_RESTORE_FAILED", err);
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

        logSafeError("PATIENT_GET_FAILED", err);

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
        if (rejectUnsafeClinicalAnalysisProfile(res, dto, beforePatient)) {
            return;
        }
        const clinicalNotesChanged =
            dto.secure_request_profile !== undefined &&
            (beforePatient.secure_request_profile?.clinicalNotes || "") !==
                (dto.secure_request_profile?.clinicalNotes || "");
        const noteChangedFields = Object.keys(dto).map((field) =>
            field === "secure_request_profile"
                ? "secure_request_profile.clinicalNotes"
                : field
        );
        const changedFields = getActuallyChangedPatientFields(
            beforePatient,
            dto
        );
        const transactionAudit = await buildPatientWriteTransactionAudit(req, {
                action: "PATIENT_UPDATE",
                operation: "UPDATE",
                changedFields: clinicalNotesChanged ? noteChangedFields : changedFields,
                context: buildPatientAuditContext(dto),
            });
        const result = clinicalNotesChanged
            ? await updatePatientWithClinicalNoteHistory(req.params.id, dto, req.auth, {
                audit: transactionAudit,
            })
            : await updatePatientWithWriteVerification(req.params.id, dto, req.auth, {
                audit: transactionAudit,
            });
        const { patient } = result;
        const writeVerification = result.writeVerification;

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

        logSafeError("PATIENT_UPDATE_FAILED", err);

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
            const transactionAudit = await buildPatientWriteTransactionAudit(req, {
                action: "PATIENT_ARCHIVE",
                operation: "UPDATE",
                changedFields: ["archivedAt", "archivedByUserId", "archiveReason"],
            });
            const { patient: archived, writeVerification } =
                await archivePatientWithWriteVerification(req.params.id, reason, req.auth, {
                    audit: transactionAudit,
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

            logSafeError("PATIENT_ARCHIVE_FAILED", err);

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
            const transactionAudit = await buildPatientWriteTransactionAudit(req, {
                action: "PATIENT_RESTORE",
                operation: "UPDATE",
                changedFields: ["archivedAt", "archivedByUserId", "archiveReason"],
            });
            const { patient: restored, writeVerification } =
                await restorePatientWithWriteVerification(req.params.id, reason, req.auth, {
                    audit: transactionAudit,
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

            logSafeError("PATIENT_RESTORE_FAILED", err);
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
