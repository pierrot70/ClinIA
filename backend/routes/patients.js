import express from "express";
import { requireRole } from "../middleware/requireRole.js";
import { AUTH_ROLES } from "../auth/constants.js";
import {
    createPatient,
    listPatients,
    listPatientAuditLogs,
    listPatientSecureRequestDocuments,
    getPatientById,
    updatePatient,
    deletePatient,
} from "../services/patients.js";
import {
    toCreatePatientDTO,
    toUpdatePatientDTO,
} from "../dto/patient.dto.js";
import { recordPatientAuditEvent } from "../audit/patientAudit.js";

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
    patientId,
    changedFields = [],
    context = null,
}) {
    await recordPatientAuditEvent({
        action,
        outcome: "SUCCESS",
        actorUserId: req.auth?.userId ?? null,
        actorUsername: req.auth?.username ?? null,
        actorRole: req.auth?.role ?? null,
        ip: getRequestIp(req),
        patientId,
        changedFields,
        requestPath: req.originalUrl || req.path || null,
        context,
    });
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
        const patient = await createPatient(dto, req.auth);

        await recordPatientMutationAudit(req, {
            action: "PATIENT_CREATE",
            patientId: patient?._id ?? null,
            changedFields: Object.keys(dto),
        });

        return res.status(201).json({
            data: patient,
            meta: {
                source: "real",
                model: "mongo",
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
            return res.status(409).json({
                error: {
                    code: "PATIENT_CONFLICT",
                    message:
                        "Ce numéro d'assurance maladie existe déjà.",
                    retryable: false,
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
        const patient = await updatePatient(req.params.id, dto, req.auth);

        await recordPatientMutationAudit(req, {
            action: "PATIENT_UPDATE",
            patientId: patient?._id ?? req.params.id,
            changedFields: Object.keys(dto),
            context: buildPatientAuditContext(dto),
        });

        return res.status(200).json({
            data: patient,
            meta: {
                source: "real",
                model: "mongo",
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

        if (err.code === 11000) {
            return res.status(409).json({
                error: {
                    code: "PATIENT_CONFLICT",
                    message:
                        "Ce numéro d'assurance maladie existe déjà.",
                    retryable: false,
                },
            });
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
/* DELETE /api/patients/:id                                            */
/* ------------------------------------------------------------------ */

router.delete(
    "/:id",
    requireRole(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPERADMIN),
    async (req, res) => {
        try {
            const deleted = await deletePatient(req.params.id, req.auth);

            await recordPatientMutationAudit(req, {
                action: "PATIENT_DELETE",
                patientId: deleted?._id ?? req.params.id,
                changedFields: [],
            });

            return res.status(200).json({
                data: deleted,
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

            console.error("❌ Patient delete error:", err);

            return res.status(500).json({
                error: {
                    code: "PERSISTENCE_FAILED",
                    message:
                        "Impossible de supprimer le patient.",
                    retryable: true,
                },
            });
        }
    }
);

export default router;
