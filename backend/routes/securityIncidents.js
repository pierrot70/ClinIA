import express from "express";
import {
    acknowledgeSecurityIncident,
    listSecurityIncidents,
    REQUIRED_ACK_ACTION,
} from "../services/securityIncidents.js";

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const data = await listSecurityIncidents({
            authUser: req.auth,
            page: req.query.page,
            limit: req.query.limit,
            acknowledged: req.query.acknowledged,
            type: req.query.type,
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

        console.error("❌ Security incident list error:", err);
        return res.status(500).json({
            error: {
                code: "INCIDENT_LIST_FAILED",
                message:
                    "Impossible de recuperer les incidents de securite.",
                retryable: true,
            },
        });
    }
});

router.post("/acknowledge", async (req, res) => {
    const { incidentId, action, context } = req.body ?? {};

    if (!incidentId || typeof incidentId !== "string") {
        return res.status(400).json({
            error: {
                code: "INVALID_INPUT",
                message: "incidentId est requis.",
                retryable: false,
            },
        });
    }

    try {
        const incident = await acknowledgeSecurityIncident({
            incidentId,
            action,
            context,
        });

        return res.status(200).json({
            data: {
                incidentId: String(incident._id),
                acknowledged: incident.acknowledged,
                acknowledgedAt: incident.acknowledgedAt,
                action: incident.acknowledgmentAction,
                context: incident.acknowledgmentContext,
            },
            meta: {
                source: "real",
                model: "mongo",
                requiredAction: REQUIRED_ACK_ACTION,
            },
        });
    } catch (err) {
        if (
            err.code === "INVALID_INCIDENT_ID" ||
            err.code === "INVALID_ACK_ACTION"
        ) {
            return res.status(400).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        if (err.code === "INCIDENT_NOT_FOUND") {
            return res.status(404).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        console.error("❌ Security incident acknowledgment error:", err);
        return res.status(500).json({
            error: {
                code: "INCIDENT_ACK_FAILED",
                message:
                    "Impossible d'enregistrer l'acknowledgment de securite. Reessayez ou contactez l'administrateur.",
                retryable: true,
            },
        });
    }
});

export default router;
