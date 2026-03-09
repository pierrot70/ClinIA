import mongoose from "mongoose";
import { SecurityIncident } from "../models/SecurityIncident.js";

const REQUIRED_ACK_ACTION = "J'ai lu et compris";

export async function createSecurityIncident(payload) {
    const incidentPayload = {
        type: "NON_SECURE_CONTENT",
        ...payload,
        detectedAt: payload?.detectedAt || new Date(),
    };

    return SecurityIncident.create(incidentPayload);
}

export async function acknowledgeSecurityIncident({
    incidentId,
    action,
    context = {},
}) {
    if (!mongoose.Types.ObjectId.isValid(incidentId)) {
        throw {
            code: "INVALID_INCIDENT_ID",
            message: "Identifiant d'incident invalide.",
        };
    }

    if (action !== REQUIRED_ACK_ACTION) {
        throw {
            code: "INVALID_ACK_ACTION",
            message: `Action invalide. Utilisez exactement '${REQUIRED_ACK_ACTION}'.`,
        };
    }

    const incident = await SecurityIncident.findById(incidentId);
    if (!incident) {
        throw {
            code: "INCIDENT_NOT_FOUND",
            message: "Incident introuvable.",
        };
    }

    if (incident.acknowledged) {
        return incident;
    }

    incident.acknowledged = true;
    incident.acknowledgmentAction = action;
    incident.acknowledgedAt = new Date();
    incident.acknowledgmentContext = context;

    await incident.save();
    return incident;
}

export async function getAcknowledgedSecurityIncident(incidentId) {
    if (!mongoose.Types.ObjectId.isValid(incidentId)) {
        return null;
    }

    const incident = await SecurityIncident.findById(incidentId).lean();
    if (!incident || !incident.acknowledged) {
        return null;
    }

    return incident;
}

export { REQUIRED_ACK_ACTION };
