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

const router = express.Router();

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

router.get("/lookup-replies", async (req, res) => {
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
        const data = await createClinicianComment({
            authUser: req.auth,
            comment: req.body?.comment,
            guestDisplayName: req.body?.guestDisplayName,
            trackingCode: req.body?.trackingCode,
            category: req.body?.category,
        });

        return res.status(201).json({
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
            const data = await replyToClinicianComment({
                authUser: req.auth,
                commentId: req.params.id,
                message: req.body?.message,
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
