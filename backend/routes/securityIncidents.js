import express from "express";
import {
    acknowledgeSecurityIncident,
    REQUIRED_ACK_ACTION,
} from "../services/securityIncidents.js";

const router = express.Router();

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
