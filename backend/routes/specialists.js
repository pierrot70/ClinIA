import express from "express";
import {
    createSpecialist,
    listSpecialists,
    getSpecialistById,
    updateSpecialist,
    deleteSpecialist,
    listEligibleClinicianAccounts,
} from "../services/specialists.js";
import { requireRole } from "../middleware/requireRole.js";
import { AUTH_ROLES } from "../auth/constants.js";
import {
    toCreateSpecialistDTO,
    toUpdateSpecialistDTO,
} from "../dto/specialist.dto.js";
import { recordWriteOperationAuditEvent } from "../audit/writeOperationAudit.js";
import { getRequestContext } from "../app/requestContext.js";
import { CLINICAL_WRITE_CONCERN } from "../db/clinicalWriteConcern.js";
import { getReplicaSetStatus } from "../services/dbStatus.js";
import { getSafeRequestPath, logSafeError } from "../utils/requestLogSafety.js";
import { getTrustedRequestIp } from "../utils/requestIp.js";

const router = express.Router();

function getRequestIp(req) {
    return getTrustedRequestIp(req);
}

function specialistConflictError(err) {
    const keyPattern = err?.keyPattern || {};
    if (keyPattern.accountUserId || err?.message?.includes("accountUserId")) {
        return {
            code: "CLINICIAN_ACCOUNT_ALREADY_LINKED",
            message:
                "Ce compte ClinIA est déjà associé à une autre fiche spécialiste. Retirez d'abord cette association.",
        };
    }

    return {
        code: "SPECIALIST_CONFLICT",
        message: "Ce numéro de médecin existe déjà.",
    };
}

async function recordSpecialistWriteAudit(req, {
    operation,
    specialistId,
    changedFields = [],
}) {
    const requestContext = getRequestContext(req);

    await recordWriteOperationAuditEvent({
        collectionName: "specialists",
        operation,
        outcome: "SUCCESS",
        actorUserId: req.auth?.userId ?? null,
        actorUsername: req.auth?.username ?? null,
        actorRole: req.auth?.role ?? null,
        ip: getRequestIp(req),
        requestId: requestContext.requestId,
        instanceId: requestContext.instanceId,
        resourceId: specialistId ? String(specialistId) : null,
        changedFields,
        requestPath: getSafeRequestPath(req),
        writeConcern: CLINICAL_WRITE_CONCERN,
        replicaSet: await getReplicaSetStatus(),
    });
}

/* ------------------------------------------------------------------ */
/* GET /api/specialists/clinician-accounts                             */
/* ------------------------------------------------------------------ */

router.get(
    "/clinician-accounts",
    requireRole(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPERADMIN),
    async (_req, res) => {
        try {
            return res.status(200).json({
                data: await listEligibleClinicianAccounts(),
                meta: { source: "real", model: "mongo" },
            });
        } catch (err) {
            logSafeError("SPECIALIST_CLINICIAN_ACCOUNTS_FAILED", err);
            return res.status(500).json({
                error: {
                    code: "PERSISTENCE_FAILED",
                    message: "Impossible de charger les comptes médecins.",
                    retryable: true,
                },
            });
        }
    }
);

/* ------------------------------------------------------------------ */
/* POST /api/specialists                                               */
/* ------------------------------------------------------------------ */

router.post("/", async (req, res) => {
    const dto = toCreateSpecialistDTO(req.body);

    if (!dto.nom || !dto.prenom || !dto.numero_medecin) {
        return res.status(400).json({
            error: {
                code: "INVALID_INPUT",
                message:
                    "Champs requis manquants (nom, prenom, numero_medecin).",
                retryable: false,
            },
        });
    }

    try {
        const specialist = await createSpecialist(dto);
        await recordSpecialistWriteAudit(req, {
            operation: "CREATE",
            specialistId: specialist._id,
            changedFields: Object.keys(dto),
        });

        return res.status(201).json({
            data: specialist,
            meta: {
                source: "real",
                model: "mongo",
            },
        });
    } catch (err) {
        if (err.code === 11000) {
            const conflict = specialistConflictError(err);
            return res.status(409).json({
                error: {
                    ...conflict,
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

        logSafeError("SPECIALIST_CREATE_FAILED", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible d’enregistrer le spécialiste.",
                retryable: true,
            },
        });
    }
});

/* ------------------------------------------------------------------ */
/* GET /api/specialists (PAGINATION BACKEND)                           */
/* ------------------------------------------------------------------ */

router.get("/", async (req, res) => {
    try {
        const { data, meta } = await listSpecialists(
            {
                nom: req.query.nom,
                prenom: req.query.prenom,
                numero_medecin: req.query.numero_medecin,
                telephone: req.query.telephone,
                email: req.query.email,
                clinique_associer:
                    req.query.clinique_associer,
            },
            {
                page: req.query.page,
                limit: req.query.limit,
            }
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
        logSafeError("SPECIALIST_LIST_FAILED", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible de récupérer les spécialistes.",
                retryable: true,
            },
        });
    }
});

/* ------------------------------------------------------------------ */
/* GET /api/specialists/:id                                            */
/* ------------------------------------------------------------------ */

router.get("/:id", async (req, res) => {
    try {
        const specialist = await getSpecialistById(req.params.id);

        return res.status(200).json({
            data: specialist,
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

        logSafeError("SPECIALIST_GET_FAILED", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible de récupérer le spécialiste.",
                retryable: true,
            },
        });
    }
});

/* ------------------------------------------------------------------ */
/* PATCH /api/specialists/:id                                          */
/* ------------------------------------------------------------------ */

router.patch("/:id", async (req, res) => {
    const dto = toUpdateSpecialistDTO(req.body);

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
        const specialist = await updateSpecialist(req.params.id, dto);
        await recordSpecialistWriteAudit(req, {
            operation: "UPDATE",
            specialistId: specialist._id,
            changedFields: Object.keys(dto),
        });

        return res.status(200).json({
            data: specialist,
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
            const conflict = specialistConflictError(err);
            return res.status(409).json({
                error: {
                    ...conflict,
                    retryable: false,
                },
            });
        }

        logSafeError("SPECIALIST_UPDATE_FAILED", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible de mettre à jour le spécialiste.",
                retryable: true,
            },
        });
    }
});

/* ------------------------------------------------------------------ */
/* DELETE /api/specialists/:id                                         */
/* ------------------------------------------------------------------ */

router.delete("/:id", async (req, res) => {
    try {
        const deleted = await deleteSpecialist(req.params.id);
        await recordSpecialistWriteAudit(req, {
            operation: "DELETE",
            specialistId: deleted._id,
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

        logSafeError("SPECIALIST_DELETE_FAILED", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible de supprimer le spécialiste.",
                retryable: true,
            },
        });
    }
});

export default router;
