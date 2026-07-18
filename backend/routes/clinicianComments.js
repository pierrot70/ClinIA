import express from "express";
import {
    acknowledgeClinicianCommentsInbox,
    createClinicianComment,
    listClinicianComments,
    listNewClinicianCommentsInbox,
    lookupClinicianReplies,
    replyToClinicianComment,
} from "../services/clinicianComments.js";
import { verifyJWT } from "../middleware/verifyJWT.js";
import { requireRole } from "../middleware/requireRole.js";
import { AUTH_ROLES } from "../auth/constants.js";
import { clinicianCommentRateLimiter } from "../middleware/clinicianCommentRateLimiter.js";
import { clinicianReplyLookupRateLimiter } from "../middleware/clinicianReplyLookupRateLimiter.js";
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

async function recordClinicianCommentWriteAudit(req, {
    operation,
    commentId,
    actorUsername = null,
    actorRole = null,
    changedFields = [],
    writeVerification = null,
}) {
    const requestContext = getRequestContext(req);

    return await recordWriteOperationAuditEvent({
        collectionName: "cliniciancomments",
        operation,
        outcome: "SUCCESS",
        actorUserId: req.auth?.userId ?? null,
        actorUsername: req.auth?.username ?? actorUsername,
        actorRole: req.auth?.role ?? actorRole,
        ip: getRequestIp(req),
        requestId: requestContext.requestId,
        instanceId: requestContext.instanceId,
        verificationId: writeVerification?.verificationId ?? null,
        clientMutationId: writeVerification?.clientMutationId ?? null,
        resourceId: commentId ? String(commentId) : null,
        changedFields,
        requestPath: getSafeRequestPath(req),
        writeConcern: CLINICAL_WRITE_CONCERN,
        replicaSet: await getReplicaSetStatus(),
    });
}

router.get(
    "/inbox",
    verifyJWT,
    requireRole(AUTH_ROLES.SUPERADMIN),
    async (req, res) => {
        try {
            const data = await listNewClinicianCommentsInbox({
                authUser: req.auth,
                page: req.query.page,
                limit: req.query.limit,
                actorUsername: req.query.actorUsername,
                category: req.query.category,
                replied: req.query.replied,
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

            console.error("❌ Clinician comments inbox error:", err);
            return res.status(500).json({
                error: {
                    code: "PERSISTENCE_FAILED",
                    message: "Impossible de recuperer les nouveaux commentaires.",
                    retryable: true,
                },
            });
        }
    }
);

router.post(
    "/inbox/acknowledge",
    verifyJWT,
    requireRole(AUTH_ROLES.SUPERADMIN),
    async (req, res) => {
        try {
            const data = await acknowledgeClinicianCommentsInbox({
                authUser: req.auth,
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

            console.error("❌ Clinician comments inbox acknowledge error:", err);
            return res.status(500).json({
                error: {
                    code: "PERSISTENCE_FAILED",
                    message: "Impossible de confirmer la lecture des nouveaux commentaires.",
                    retryable: true,
                },
            });
        }
    }
);

router.get("/lookup-replies", clinicianReplyLookupRateLimiter, async (req, res) => {
    try {
        const data = await lookupClinicianReplies({
            actorUsername: req.query.actorUsername,
            trackingCode: req.query.trackingCode,
        });

        return res.status(200).json({
            data,
            meta: {
                source: "real",
                model: "mongo",
            },
        });
    } catch (err) {
        if (err.code === "INVALID_INPUT") {
            return res.status(400).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        console.error("❌ Clinician replies lookup error:", err);
        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message: "Impossible de recuperer les reponses.",
                retryable: true,
            },
        });
    }
});

router.get(
    "/",
    verifyJWT,
    requireRole(
        AUTH_ROLES.USER,
        AUTH_ROLES.MEDECIN,
        AUTH_ROLES.ADMIN,
        AUTH_ROLES.SUPERADMIN
    ),
    async (req, res) => {
    try {
        const data = await listClinicianComments({
            authUser: req.auth,
            page: req.query.page,
            limit: req.query.limit,
            scope: req.query.scope,
            actorUsername: req.query.actorUsername,
            category: req.query.category,
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

        console.error("❌ Clinician comments list error:", err);
        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message: "Impossible de recuperer les commentaires.",
                retryable: true,
            },
        });
    }
});

router.post("/", clinicianCommentRateLimiter, async (req, res) => {
    try {
        const writeVerification = createWriteVerificationContext(req);
        const data = await createClinicianComment({
            authUser: req.auth,
            comment: req.body?.comment,
            guestDisplayName: req.body?.guestDisplayName,
            trackingCode: req.body?.trackingCode,
            category: req.body?.category,
        });
        const writeAuditRecorded = await recordClinicianCommentWriteAudit(req, {
            operation: "CREATE",
            commentId: data.id,
            actorUsername: data.actorUsername,
            actorRole: data.actorRole,
            changedFields: [
                "actorUsername",
                "category",
                "comment",
                "trackingCodeHash",
            ],
            writeVerification,
        });

        return res.status(201).json({
            data,
            meta: {
                source: "real",
                model: "mongo",
                writeVerification: buildWriteVerificationMeta({
                    writeAuditRecorded,
                    ...writeVerification,
                }),
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

        console.error("❌ Clinician comment create error:", err);
        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message: "Impossible d'enregistrer le commentaire.",
                retryable: true,
            },
        });
    }
});

router.post(
    "/:id/reply",
    verifyJWT,
    requireRole(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPERADMIN),
    async (req, res) => {
        try {
            const writeVerification = createWriteVerificationContext(req);
            const data = await replyToClinicianComment({
                authUser: req.auth,
                commentId: req.params.id,
                message: req.body?.message,
            });
            const writeAuditRecorded = await recordClinicianCommentWriteAudit(req, {
                operation: "REPLY",
                commentId: data.id,
                changedFields: ["replies"],
                writeVerification,
            });

            return res.status(200).json({
                data,
                meta: {
                    source: "real",
                    model: "mongo",
                    writeVerification: buildWriteVerificationMeta({
                        writeAuditRecorded,
                        ...writeVerification,
                    }),
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

            console.error("❌ Clinician comment reply error:", err);
            return res.status(500).json({
                error: {
                    code: "PERSISTENCE_FAILED",
                    message: "Impossible d'enregistrer la reponse.",
                    retryable: true,
                },
            });
        }
    }
);

export default router;
