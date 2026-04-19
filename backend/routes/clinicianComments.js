import express from "express";
import {
    createClinicianComment,
    listClinicianComments,
} from "../services/clinicianComments.js";
import { verifyJWT } from "../middleware/verifyJWT.js";
import { requireRole } from "../middleware/requireRole.js";
import { AUTH_ROLES } from "../auth/constants.js";

const router = express.Router();

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

router.post("/", async (req, res) => {
    try {
        const data = await createClinicianComment({
            authUser: req.auth,
            comment: req.body?.comment,
            guestDisplayName: req.body?.guestDisplayName,
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

export default router;
