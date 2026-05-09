import mongoose from "mongoose";
import { SecurityIncident } from "../models/SecurityIncident.js";

const REQUIRED_ACK_ACTION = "J'ai lu et compris";

function createSecurityIncidentError(code, message) {
    return { code, message };
}

function assertSecurityIncidentAccess(authUser) {
    if (!authUser?.role || !["ADMIN", "SUPERADMIN"].includes(authUser.role)) {
        throw createSecurityIncidentError(
            "FORBIDDEN",
            "Action reservee aux administrateurs."
        );
    }
}

function normalizeSecurityIncident(incident) {
    return {
        id: String(incident._id),
        type: incident.type,
        phase: incident.phase,
        reason: incident.reason,
        requestPath: incident.requestPath,
        transport: incident.transport,
        matches: Array.isArray(incident.matches) ? incident.matches : [],
        context:
            incident.context && typeof incident.context === "object"
                ? incident.context
                : {},
        detectedAt: incident.detectedAt,
        acknowledged: incident.acknowledged === true,
        acknowledgmentAction: incident.acknowledgmentAction || "",
        acknowledgedAt: incident.acknowledgedAt || null,
        acknowledgmentContext:
            incident.acknowledgmentContext &&
            typeof incident.acknowledgmentContext === "object"
                ? incident.acknowledgmentContext
                : {},
        createdAt: incident.createdAt || null,
        updatedAt: incident.updatedAt || null,
    };
}

export async function createSecurityIncident(payload) {
    const incidentPayload = {
        type: "NON_SECURE_CONTENT",
        ...payload,
        detectedAt: payload?.detectedAt || new Date(),
    };

    return SecurityIncident.create(incidentPayload);
}

export async function listSecurityIncidents({
    authUser,
    page,
    limit,
    acknowledged,
    type,
}) {
    assertSecurityIncidentAccess(authUser);

    const rawPage = page === undefined ? 1 : Number.parseInt(page, 10);
    const rawLimit = limit === undefined ? 20 : Number.parseInt(limit, 10);
    const parsedPage = Number.isFinite(rawPage) ? rawPage : Number.NaN;
    const parsedLimit = Number.isFinite(rawLimit) ? rawLimit : Number.NaN;

    if (
        !Number.isInteger(parsedPage) ||
        !Number.isInteger(parsedLimit) ||
        parsedPage < 1 ||
        parsedLimit < 1 ||
        parsedLimit > 100
    ) {
        throw createSecurityIncidentError("INVALID_INPUT", "Pagination invalide.");
    }

    const query = {};

    if (typeof acknowledged === "string" && acknowledged.trim()) {
        const normalizedAcknowledged = acknowledged.trim().toLowerCase();
        if (!["true", "false"].includes(normalizedAcknowledged)) {
            throw createSecurityIncidentError(
                "INVALID_INPUT",
                "Valeur acknowledged invalide."
            );
        }
        query.acknowledged = normalizedAcknowledged === "true";
    }

    if (typeof type === "string" && type.trim()) {
        query.type = type.trim().toUpperCase();
    }

    const skip = (parsedPage - 1) * parsedLimit;

    const [total, incidents] = await Promise.all([
        SecurityIncident.countDocuments(query),
        SecurityIncident.find(query)
            .sort({ detectedAt: -1, createdAt: -1 })
            .skip(skip)
            .limit(parsedLimit)
            .lean(),
    ]);

    return {
        incidents: incidents.map((incident) => normalizeSecurityIncident(incident)),
        pagination: {
            page: parsedPage,
            limit: parsedLimit,
            total,
            totalPages: Math.ceil(total / parsedLimit),
        },
    };
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
