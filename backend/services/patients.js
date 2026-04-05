import mongoose from "mongoose";
import { Patient } from "../models/Patient.js";
import { PatientAuditLog } from "../models/PatientAuditLog.js";
import { geocodeFreeAddress } from "../utils/geocode.js";

/* ------------------------------------------------------------------ */
/* Service Patient                                                     */
/* ------------------------------------------------------------------ */

function createPatientError(code, message) {
    return { code, message };
}

function assertPatientAuditAccess(authUser) {
    if (
        !authUser?.role ||
        !["ADMIN", "SUPERADMIN"].includes(authUser.role)
    ) {
        throw createPatientError(
            "FORBIDDEN",
            "Action reservee aux administrateurs."
        );
    }
}

function randomDigits(length) {
    let out = "";
    for (let i = 0; i < length; i++) {
        out += Math.floor(Math.random() * 10).toString();
    }
    return out;
}

function generateRamqNumber() {
    return `RAMQ${randomDigits(10)}`;
}

async function ensureUniqueRamqNumber() {
    for (let i = 0; i < 5; i++) {
        const candidate = generateRamqNumber();
        const existing = await Patient.findOne({
            num_assurance_maladie: candidate,
        }).lean();
        if (!existing) return candidate;
    }

    throw {
        code: "RAMQ_GENERATION_FAILED",
        message:
            "Impossible de générer un numéro RAMQ unique.",
    };
}

export async function createPatient(dto) {
    if (!dto.nom || !dto.prenom) {
        throw {
            code: "INVALID_INPUT",
            message: "Les champs 'nom' et 'prenom' sont requis.",
        };
    }

    if (!dto.num_assurance_maladie) {
        dto.num_assurance_maladie =
            await ensureUniqueRamqNumber();
    }

    if (
        dto.addresse &&
        (dto.lat === undefined || dto.long === undefined)
    ) {
        const coords = await geocodeFreeAddress(dto.addresse);
        if (coords) {
            if (dto.lat === undefined) dto.lat = coords.lat;
            if (dto.long === undefined) dto.long = coords.long;
        }
    }

    return Patient.create(dto);
}

export async function listPatients(filters = {}, opts = {}) {
    const query = {};

    if (filters.nom) {
        query.nom = { $regex: filters.nom, $options: "i" };
    }
    if (filters.prenom) {
        query.prenom = { $regex: filters.prenom, $options: "i" };
    }
    if (filters.num_assurance_maladie) {
        query.num_assurance_maladie = {
            $regex: filters.num_assurance_maladie,
            $options: "i",
        };
    }
    if (filters.telephone) {
        query.telephone = {
            $regex: filters.telephone,
            $options: "i",
        };
    }
    if (filters.addresse) {
        query.addresse = {
            $regex: filters.addresse,
            $options: "i",
        };
    }

    const page = Math.max(parseInt(opts.page) || 1, 1);
    const limit = Math.min(parseInt(opts.limit) || 10, 50);
    const skip = (page - 1) * limit;
    const allowedSorts = new Set([
        "nom",
        "prenom",
        "addresse",
        "telephone",
        "num_assurance_maladie",
    ]);
    const sortBy = allowedSorts.has(opts.sortBy)
        ? opts.sortBy
        : "nom";
    const sortDir = opts.sortDir === "desc" ? -1 : 1;
    const sort =
        sortBy === "prenom"
            ? { prenom: sortDir, nom: 1 }
            : { [sortBy]: sortDir, prenom: 1 };

    const [data, total] = await Promise.all([
        Patient.find(query)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean(),
        Patient.countDocuments(query),
    ]);

    return {
        data,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

export async function listPatientAuditLogs({
    authUser,
    page,
    limit,
    action,
    patientId,
    actorUserId,
    startDate,
    endDate,
}) {
    assertPatientAuditAccess(authUser);

    const parsedPage = Number.parseInt(page, 10) || 1;
    const parsedLimit = Number.parseInt(limit, 10) || 20;

    if (parsedPage < 1 || parsedLimit < 1 || parsedLimit > 100) {
        throw createPatientError("INVALID_INPUT", "Pagination invalide.");
    }

    const allowedActions = new Set([
        "PATIENT_CREATE",
        "PATIENT_UPDATE",
        "PATIENT_DELETE",
    ]);

    const query = {};
    const andClauses = [];

    if (startDate || endDate) {
        const dateQuery = {};

        if (startDate) {
            const parsedStart = new Date(`${startDate}T00:00:00.000`);
            if (Number.isNaN(parsedStart.getTime())) {
                throw createPatientError(
                    "INVALID_INPUT",
                    "Date de debut invalide."
                );
            }
            dateQuery.$gte = parsedStart;
        }

        if (endDate) {
            const parsedEnd = new Date(`${endDate}T23:59:59.999`);
            if (Number.isNaN(parsedEnd.getTime())) {
                throw createPatientError(
                    "INVALID_INPUT",
                    "Date de fin invalide."
                );
            }
            dateQuery.$lte = parsedEnd;
        }

        andClauses.push({ timestamp: dateQuery });
    }

    if (typeof action === "string" && action.trim()) {
        const normalizedAction = action.trim().toUpperCase();
        if (!allowedActions.has(normalizedAction)) {
            throw createPatientError("INVALID_INPUT", "Action invalide.");
        }
        andClauses.push({ action: normalizedAction });
    }

    if (typeof patientId === "string" && patientId.trim()) {
        if (!mongoose.Types.ObjectId.isValid(patientId.trim())) {
            throw createPatientError(
                "INVALID_INPUT",
                "Identifiant patient invalide."
            );
        }
        andClauses.push({ patientId: patientId.trim() });
    }

    if (typeof actorUserId === "string" && actorUserId.trim()) {
        if (!mongoose.Types.ObjectId.isValid(actorUserId.trim())) {
            throw createPatientError(
                "INVALID_INPUT",
                "Identifiant utilisateur invalide."
            );
        }
        andClauses.push({ actorUserId: actorUserId.trim() });
    }

    if (andClauses.length > 0) {
        query.$and = andClauses;
    }

    const skip = (parsedPage - 1) * parsedLimit;

    const [total, logs] = await Promise.all([
        PatientAuditLog.countDocuments(query),
        PatientAuditLog.find(query)
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(parsedLimit)
            .lean(),
    ]);

    return {
        logs: logs.map((log) => ({
            id: String(log._id),
            action: log.action,
            outcome: log.outcome,
            actorUserId: log.actorUserId
                ? String(log.actorUserId)
                : null,
            actorUsernameMasked: log.actorUsernameMasked,
            actorRole: log.actorRole,
            ip: log.ip,
            patientId: log.patientId ? String(log.patientId) : null,
            changedFields: Array.isArray(log.changedFields)
                ? log.changedFields
                : [],
            requestPath: log.requestPath,
            context:
                log.context && typeof log.context === "object"
                    ? log.context
                    : null,
            timestamp: log.timestamp,
        })),
        pagination: {
            page: parsedPage,
            limit: parsedLimit,
            total,
            totalPages: Math.max(1, Math.ceil(total / parsedLimit)),
        },
    };
}

export async function listPatientSecureRequestDocuments(patientId) {
    if (!mongoose.Types.ObjectId.isValid(patientId)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant patient invalide.",
        };
    }

    const patient = await Patient.findById(patientId).lean();

    if (!patient) {
        throw {
            code: "NOT_FOUND",
            message: "Patient introuvable.",
        };
    }

    const logs = await PatientAuditLog.find({
        patientId,
        action: "PATIENT_UPDATE",
        changedFields: "secure_request_profile",
    })
        .sort({ timestamp: -1 })
        .lean();

    const latestBySpecialty = new Map();

    for (const log of logs) {
        const secureRequest =
            log?.context && typeof log.context === "object"
                ? log.context.secureRequest
                : null;

        const clinicalScope =
            typeof secureRequest?.clinicalScope === "string"
                ? secureRequest.clinicalScope.trim()
                : "";

        if (!clinicalScope) {
            continue;
        }

        const specialtyKey = clinicalScope.toLowerCase();

        if (latestBySpecialty.has(specialtyKey)) {
            continue;
        }

        latestBySpecialty.set(specialtyKey, {
            id: `secure-request-log:${String(log._id)}`,
            title: clinicalScope,
            type: "Derniere requete securisee",
            uploadedAt: log.timestamp,
            sourceAuditLogId: String(log._id),
            clinicalScope,
            objective:
                typeof secureRequest?.objective === "string"
                    ? secureRequest.objective.trim()
                    : "",
            selectedDocumentIds: Array.isArray(secureRequest?.selectedDocumentIds)
                ? secureRequest.selectedDocumentIds.filter(
                    (entry) => typeof entry === "string" && entry.trim()
                )
                : [],
        });
    }

    return Array.from(latestBySpecialty.values());
}

export async function getPatientById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant patient invalide.",
        };
    }

    const patient = await Patient.findById(id).lean();

    if (!patient) {
        throw {
            code: "NOT_FOUND",
            message: "Patient introuvable.",
        };
    }

    return patient;
}

export async function updatePatient(id, updates) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant patient invalide.",
        };
    }

    const existing = await Patient.findById(id).lean();
    if (!existing) {
        throw {
            code: "NOT_FOUND",
            message: "Patient introuvable.",
        };
    }

    if (
        updates.num_assurance_maladie === "" ||
        updates.nom === "" ||
        updates.prenom === ""
    ) {
        throw {
            code: "INVALID_INPUT",
            message:
                "Les champs 'nom', 'prenom' et 'num_assurance_maladie' ne peuvent pas être vides.",
        };
    }

    if (
        (updates.lat === undefined || updates.long === undefined) &&
        (updates.addresse ?? existing.addresse)
    ) {
        const coords = await geocodeFreeAddress(
            updates.addresse ?? existing.addresse
        );
        if (coords) {
            if (updates.lat === undefined) updates.lat = coords.lat;
            if (updates.long === undefined) updates.long = coords.long;
        }
    }

    const patient = await Patient.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true }
    );

    if (!patient) {
        throw {
            code: "NOT_FOUND",
            message: "Patient introuvable.",
        };
    }

    return patient;
}

export async function deletePatient(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant patient invalide.",
        };
    }

    const deleted = await Patient.findByIdAndDelete(id);

    if (!deleted) {
        throw {
            code: "NOT_FOUND",
            message: "Patient introuvable.",
        };
    }

    return deleted;
}
