import mongoose from "mongoose";
import crypto from "node:crypto";
import { Patient } from "../models/Patient.js";
import { PatientClinicalNoteVersion } from "../models/PatientClinicalNoteVersion.js";
import { PatientAuditLog } from "../models/PatientAuditLog.js";
import { PatientSecureRequestSnapshot } from "../models/PatientSecureRequestSnapshot.js";
import { recordPatientAuditEvent } from "../audit/patientAudit.js";
import { recordWriteOperationAuditEvent } from "../audit/writeOperationAudit.js";
import { buildOwnerScope } from "../auth/resourceAccess.js";
import { getActiveDelegatedPatientAccess } from "./clinicalSupportAccess.js";
import {
    buildPatientSearchKeys,
    normalizeHealthInsuranceJurisdiction,
    normalizePatientIdentifierSearch,
    normalizePatientTextSearch,
} from "../utils/patientSearchKeys.js";
import {
    CLINICAL_QUERY_WRITE_OPTIONS,
    CLINICAL_WRITE_CONCERN,
} from "../db/clinicalWriteConcern.js";

/* ------------------------------------------------------------------ */
/* Service Patient                                                     */
/* ------------------------------------------------------------------ */

function createPatientError(code, message) {
    return { code, message };
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MAX_PATIENT_SEARCH_LENGTH = 80;
const MAX_PATIENT_SEARCH_TERMS = 4;

function normalizePatientSearchValue(value, normalizer = normalizePatientTextSearch) {
    if (typeof value !== "string") {
        return "";
    }

    return normalizer(value).slice(0, MAX_PATIENT_SEARCH_LENGTH);
}

function buildPatientSearchRegex(value, normalizer) {
    const normalized = normalizePatientSearchValue(value, normalizer);
    return normalized ? new RegExp(`^${escapeRegex(normalized)}`) : null;
}

function buildPatientSearchTerms(value) {
    return normalizePatientSearchValue(value)
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, MAX_PATIENT_SEARCH_TERMS)
        .map((term) => new RegExp(`^${escapeRegex(term)}`));
}

function maskUsername(username) {
    if (!username || typeof username !== "string") return "unknown";
    return username.trim().toLowerCase().slice(0, 2) + "***";
}

function clinicalNotesFrom(patient) {
    return typeof patient?.secure_request_profile?.clinicalNotes === "string"
        ? patient.secure_request_profile.clinicalNotes
        : "";
}

function secureRequestSnapshotPayload(patientId, profile = {}) {
    const clinicalScope = typeof profile.clinicalScope === "string"
        ? profile.clinicalScope.trim().slice(0, 160)
        : "";
    if (!clinicalScope) return null;

    const selectedDocumentIds = Array.isArray(profile.selected_document_ids)
        ? Array.from(new Set(profile.selected_document_ids
            .filter((value) => typeof value === "string")
            .map((value) => value.trim())
            .filter(Boolean)))
        : [];

    return {
        patientId,
        clinicalScope,
        clinicalScopeKey: clinicalScope.toLocaleLowerCase(),
        objective: typeof profile.objective === "string"
            ? profile.objective.trim().slice(0, 500)
            : "",
        selectedDocumentIds,
        source: "patient_profile",
    };
}

async function savePatientSecureRequestSnapshot(patientId, profile, { session = null } = {}) {
    const snapshot = secureRequestSnapshotPayload(patientId, profile);
    if (!snapshot) return null;
    return PatientSecureRequestSnapshot.findOneAndUpdate(
        { patientId: snapshot.patientId, clinicalScopeKey: snapshot.clinicalScopeKey },
        { $set: snapshot },
        { upsert: true, new: true, ...(session ? { session } : {}) }
    );
}

function hashClinicalNote(note) {
    return crypto.createHash("sha256").update(note, "utf8").digest("hex");
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

export async function createPatient(
    dto,
    authUser,
    { allowPotentialDuplicate = false, session = null } = {}
) {
    const ownerScope = buildOwnerScope(authUser);

    if (!dto.nom || !dto.prenom) {
        throw {
            code: "INVALID_INPUT",
            message: "Les champs 'nom' et 'prenom' sont requis.",
        };
    }

    const hasHealthInsuranceNumber = Boolean(
        normalizePatientIdentifierSearch(dto.num_assurance_maladie)
    );
    if (!hasHealthInsuranceNumber && !allowPotentialDuplicate) {
        const keys = buildPatientSearchKeys(dto);
        const potentialDuplicate = await Patient.exists({
            ...ownerScope,
            archivedAt: null,
            nomSearch: keys.nomSearch,
            prenomSearch: keys.prenomSearch,
        });

        if (potentialDuplicate) {
            throw {
                code: "POTENTIAL_DUPLICATE",
                message:
                    "Un patient avec le même nom et prénom existe déjà. Vérifiez-le avant de créer un nouveau dossier.",
            };
        }
    }

    const patient = new Patient({
        ...dto,
        healthInsuranceJurisdiction: normalizeHealthInsuranceJurisdiction(
            dto.healthInsuranceJurisdiction,
            dto.num_assurance_maladie
        ),
        ...buildPatientSearchKeys(dto),
        ownerUserId: authUser.userId,
    });

    const savedPatient = await patient.save({
        ...CLINICAL_WRITE_CONCERN,
        ...(session ? { session } : {}),
    });
    if (Object.hasOwn(dto, "secure_request_profile")) {
        await savePatientSecureRequestSnapshot(
            savedPatient._id,
            dto.secure_request_profile,
            { session }
        );
    }
    return savedPatient;
}

export async function listPatients(filters = {}, opts = {}, authUser) {
    const patientListProjection =
        "_id nom prenom num_assurance_maladie addresse telephone archivedAt";
    const archiveStatus = opts.archiveStatus === "archived" ? "archived" : "active";
    const query = {
        ...buildOwnerScope(authUser),
        archivedAt: archiveStatus === "archived" ? { $ne: null } : null,
    };
    const hasGeneralSearch =
        typeof filters.q === "string" && Boolean(filters.q.trim());

    if (hasGeneralSearch) {
        const terms = buildPatientSearchTerms(filters.q);

        if (terms.length) {
            query.$and = terms.map((term) => ({
                $or: [{ nomSearch: term }, { prenomSearch: term }],
            }));
        }
    }

    if (!hasGeneralSearch) {
        const nomRegex = buildPatientSearchRegex(filters.nom);
        if (nomRegex) {
            query.nomSearch = { $regex: nomRegex };
        }
    }
    if (!hasGeneralSearch) {
        const prenomRegex = buildPatientSearchRegex(filters.prenom);
        if (prenomRegex) {
            query.prenomSearch = { $regex: prenomRegex };
        }
    }
    const healthInsuranceNumberRegex = buildPatientSearchRegex(
        filters.num_assurance_maladie,
        normalizePatientIdentifierSearch
    );
    if (healthInsuranceNumberRegex) {
        query.healthInsuranceNumberSearch = {
            $regex: healthInsuranceNumberRegex,
        };
    }
    const telephoneRegex = buildPatientSearchRegex(
        filters.telephone,
        normalizePatientIdentifierSearch
    );
    if (telephoneRegex) {
        query.telephoneSearch = { $regex: telephoneRegex };
    }
    const addressRegex = buildPatientSearchRegex(filters.addresse);
    if (addressRegex) {
        query.addresseSearch = { $regex: addressRegex };
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
            .select(patientListProjection)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean(),
        Patient.countDocuments(query),
    ]);

    return {
        // Keep list responses safe even if a future query projection changes.
        data: data.map((patient) => ({
            _id: patient._id,
            nom: patient.nom,
            prenom: patient.prenom,
            num_assurance_maladie: patient.num_assurance_maladie,
            addresse: patient.addresse,
            telephone: patient.telephone,
            archivedAt: patient.archivedAt,
        })),
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
        "PATIENT_ARCHIVE",
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

export async function listPatientSecureRequestDocuments(patientId, authUser) {
    if (!mongoose.Types.ObjectId.isValid(patientId)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant patient invalide.",
        };
    }

    const patient = await Patient.findOne({
        _id: patientId,
        ...buildOwnerScope(authUser),
    }).lean();

    if (!patient) {
        throw {
            code: "NOT_FOUND",
            message: "Patient introuvable.",
        };
    }

    const snapshots = await PatientSecureRequestSnapshot.find({ patientId })
        .sort({ updatedAt: -1 })
        .lean();
    return snapshots.map((snapshot) => ({
            id: `secure-request-snapshot:${String(snapshot._id)}`,
            title: snapshot.clinicalScope,
            type: "Derniere requete securisee",
            uploadedAt: snapshot.updatedAt || snapshot.createdAt,
            sourceAuditLogId: null,
            clinicalScope: snapshot.clinicalScope,
            objective: snapshot.objective || "",
            selectedDocumentIds: Array.isArray(snapshot.selectedDocumentIds)
                ? snapshot.selectedDocumentIds
                : [],
        }));
}

export async function getPatientById(id, authUser) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant patient invalide.",
        };
    }

    let query;
    if (authUser?.role === "SUPERADMIN") {
        const delegatedAccess = await getActiveDelegatedPatientAccess(id, authUser);
        if (!delegatedAccess) {
            throw createPatientError(
                "CLINICAL_ACCESS_REQUIRED",
                "Une autorisation clinique déléguée active est requise pour ce dossier."
            );
        }
        query = { _id: id, ownerUserId: delegatedAccess.physicianUserId };
    } else {
        query = { _id: id, ...buildOwnerScope(authUser) };
    }

    const patient = await Patient.findOne(query).lean();

    if (!patient) {
        throw {
            code: "NOT_FOUND",
            message: "Patient introuvable.",
        };
    }

    return patient;
}

async function preparePatientUpdate(id, updates, authUser) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant patient invalide.",
        };
    }

    const ownerScope = buildOwnerScope(authUser);
    const existing = await Patient.findOne({
        _id: id,
        ...ownerScope,
    }).lean();
    if (!existing) {
        throw {
            code: "NOT_FOUND",
            message: "Patient introuvable.",
        };
    }

    if (existing.archivedAt) {
        throw {
            code: "PATIENT_ARCHIVED",
            message: "Ce dossier patient est archivé et ne peut plus être modifié.",
        };
    }

    if (
        updates.nom === "" ||
        updates.prenom === ""
    ) {
        throw {
            code: "INVALID_INPUT",
            message:
                "Les champs 'nom' et 'prenom' ne peuvent pas être vides.",
        };
    }

    return { existing, ownerScope, updates };
}

export async function updatePatient(id, updates, authUser) {
    const { existing, ownerScope, updates: preparedUpdates } = await preparePatientUpdate(
        id,
        updates,
        authUser
    );
    const updatesWithSearchKeys = {
        ...preparedUpdates,
        healthInsuranceJurisdiction: normalizeHealthInsuranceJurisdiction(
            preparedUpdates.healthInsuranceJurisdiction ||
                existing.healthInsuranceJurisdiction,
            preparedUpdates.num_assurance_maladie ??
                existing.num_assurance_maladie
        ),
        ...buildPatientSearchKeys({ ...existing, ...preparedUpdates }),
    };

    const patient = await Patient.findOneAndUpdate(
        { _id: id, ...ownerScope },
        { $set: updatesWithSearchKeys },
        {
            new: true,
            runValidators: true,
            ...CLINICAL_QUERY_WRITE_OPTIONS,
        }
    );

    if (!patient) {
        throw {
            code: "NOT_FOUND",
            message: "Patient introuvable.",
        };
    }

    if (Object.hasOwn(preparedUpdates, "secure_request_profile")) {
        await savePatientSecureRequestSnapshot(
            patient._id,
            preparedUpdates.secure_request_profile
        );
    }

    return patient;
}

function toClinicalNoteVersion({
    patientId,
    ownerUserId,
    version,
    note,
    changeType,
    restoredFromVersionId = null,
    authUser,
}) {
    return {
        patientId,
        ownerUserId,
        version,
        note,
        contentHash: hashClinicalNote(note),
        changeType,
        restoredFromVersionId,
        actorUserId: authUser?.userId ?? null,
        actorUsernameMasked: maskUsername(authUser?.username),
        actorRole: authUser?.role ?? null,
    };
}

async function recordPatientMutationInTransaction({
    audit,
    patientId,
    noteVersion = null,
    session,
}) {
    if (!audit) {
        return null;
    }

    const patientAuditLog = await recordPatientAuditEvent({
        action: audit.action,
        outcome: "SUCCESS",
        actorUserId: audit.actorUserId,
        actorUsername: audit.actorUsername,
        actorRole: audit.actorRole,
        ip: audit.ip,
        patientId,
        changedFields: audit.changedFields,
        requestPath: audit.requestPath,
        context: audit.context,
        session,
        throwOnError: true,
    });

    const common = {
        verificationId: audit.verificationId,
        clientMutationId: audit.clientMutationId,
        actorUserId: audit.actorUserId,
        actorUsername: audit.actorUsername,
        actorRole: audit.actorRole,
        ip: audit.ip,
        requestId: audit.requestId,
        instanceId: audit.instanceId,
        patientId: String(patientId),
        requestPath: audit.requestPath,
        writeConcern: CLINICAL_WRITE_CONCERN,
        replicaSet: audit.replicaSet,
        session,
        throwOnError: true,
    };

    if (noteVersion) {
        await recordWriteOperationAuditEvent({
            ...common,
            collectionName: "patientclinicalnoteversions",
            operation: "CREATE",
            outcome: "SUCCESS",
            resourceId: String(noteVersion._id),
            changedFields: ["version", "contentHash", "changeType"],
        });
    }

    await recordWriteOperationAuditEvent({
        ...common,
        collectionName: "patientauditlogs",
        operation: "CREATE",
        outcome: "SUCCESS",
        resourceId: String(patientAuditLog._id),
        changedFields: [
            "action",
            "outcome",
            "actorUserId",
            "actorUsernameMasked",
            "actorRole",
            "patientId",
            "changedFields",
            "requestPath",
            "context",
        ],
    });

    await recordWriteOperationAuditEvent({
        ...common,
        collectionName: "patients",
        operation: audit.operation,
        outcome: "SUCCESS",
        resourceId: String(patientId),
        changedFields: audit.changedFields,
    });

    return {
        status: "CONFIRMED",
        verificationId: audit.verificationId,
        clientMutationId: audit.clientMutationId,
    };
}

async function runPatientWriteTransaction(callback) {
    const session = await mongoose.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            result = await callback(session);
        }, { writeConcern: CLINICAL_WRITE_CONCERN });
        return result;
    } finally {
        await session.endSession();
    }
}

export async function createPatientWithWriteVerification(
    dto,
    authUser,
    { allowPotentialDuplicate = false, audit = null } = {}
) {
    const ownerScope = buildOwnerScope(authUser);

    if (!dto.nom || !dto.prenom) {
        throw {
            code: "INVALID_INPUT",
            message: "Les champs 'nom' et 'prenom' sont requis.",
        };
    }

    const hasHealthInsuranceNumber = Boolean(
        normalizePatientIdentifierSearch(dto.num_assurance_maladie)
    );
    if (!hasHealthInsuranceNumber && !allowPotentialDuplicate) {
        const keys = buildPatientSearchKeys(dto);
        const potentialDuplicate = await Patient.exists({
            ...ownerScope,
            archivedAt: null,
            nomSearch: keys.nomSearch,
            prenomSearch: keys.prenomSearch,
        });

        if (potentialDuplicate) {
            throw {
                code: "POTENTIAL_DUPLICATE",
                message:
                    "Un patient avec le même nom et prénom existe déjà. Vérifiez-le avant de créer un nouveau dossier.",
            };
        }
    }

    return runPatientWriteTransaction(async (session) => {
        const patient = new Patient({
            ...dto,
            healthInsuranceJurisdiction: normalizeHealthInsuranceJurisdiction(
                dto.healthInsuranceJurisdiction,
                dto.num_assurance_maladie
            ),
            ...buildPatientSearchKeys(dto),
            ownerUserId: authUser.userId,
        });
        const savedPatient = await patient.save({
            ...CLINICAL_WRITE_CONCERN,
            session,
        });

        if (Object.hasOwn(dto, "secure_request_profile")) {
            await savePatientSecureRequestSnapshot(
                savedPatient._id,
                dto.secure_request_profile,
                { session }
            );
        }

        const writeVerification = await recordPatientMutationInTransaction({
            audit,
            patientId: savedPatient._id,
            session,
        });

        return { patient: savedPatient, writeVerification };
    });
}

export async function updatePatientWithWriteVerification(
    id,
    updates,
    authUser,
    { audit = null } = {}
) {
    const { existing, ownerScope, updates: preparedUpdates } = await preparePatientUpdate(
        id,
        updates,
        authUser
    );
    const updatesWithSearchKeys = {
        ...preparedUpdates,
        healthInsuranceJurisdiction: normalizeHealthInsuranceJurisdiction(
            preparedUpdates.healthInsuranceJurisdiction ||
                existing.healthInsuranceJurisdiction,
            preparedUpdates.num_assurance_maladie ??
                existing.num_assurance_maladie
        ),
        ...buildPatientSearchKeys({ ...existing, ...preparedUpdates }),
    };

    return runPatientWriteTransaction(async (session) => {
        const patient = await Patient.findOneAndUpdate(
            { _id: id, ...ownerScope },
            { $set: updatesWithSearchKeys },
            { new: true, runValidators: true, session }
        );
        if (!patient) {
            throw { code: "NOT_FOUND", message: "Patient introuvable." };
        }

        if (Object.hasOwn(preparedUpdates, "secure_request_profile")) {
            await savePatientSecureRequestSnapshot(
                patient._id,
                preparedUpdates.secure_request_profile,
                { session }
            );
        }

        const writeVerification = await recordPatientMutationInTransaction({
            audit,
            patientId: patient._id,
            session,
        });

        return { patient, writeVerification };
    });
}

async function updatePatientArchiveStateWithWriteVerification(
    id,
    authUser,
    { query, update, notFoundMessage, audit }
) {
    return runPatientWriteTransaction(async (session) => {
        const patient = await Patient.findOneAndUpdate(
            { _id: id, ...buildOwnerScope(authUser), ...query },
            { $set: update },
            { new: true, runValidators: true, session }
        );
        if (!patient) {
            throw { code: "NOT_FOUND", message: notFoundMessage };
        }

        const writeVerification = await recordPatientMutationInTransaction({
            audit,
            patientId: patient._id,
            session,
        });
        return { patient, writeVerification };
    });
}

export async function updatePatientWithClinicalNoteHistory(
    id,
    updates,
    authUser,
    {
        changeType = "UPDATE",
        restoredFromVersionId = null,
        forceVersion = false,
        audit = null,
    } = {}
) {
    const { existing, ownerScope, updates: preparedUpdates } =
        await preparePatientUpdate(id, updates, authUser);
    const updatesWithSearchKeys = {
        ...preparedUpdates,
        healthInsuranceJurisdiction: normalizeHealthInsuranceJurisdiction(
            preparedUpdates.healthInsuranceJurisdiction ||
                existing.healthInsuranceJurisdiction,
            preparedUpdates.num_assurance_maladie ??
                existing.num_assurance_maladie
        ),
        ...buildPatientSearchKeys({ ...existing, ...preparedUpdates }),
    };
    const previousNote = clinicalNotesFrom(existing);
    const nextNote = clinicalNotesFrom({
        secure_request_profile: preparedUpdates.secure_request_profile,
    });
    const noteChanged =
        Object.hasOwn(preparedUpdates, "secure_request_profile") &&
        (previousNote !== nextNote || forceVersion);

    if (!noteChanged) {
        return { patient: await updatePatient(id, preparedUpdates, authUser), noteVersion: null };
    }

    const session = await mongoose.startSession();
    try {
        let patient;
        let noteVersion;
        let writeVerification;

        await session.withTransaction(
            async () => {
                const latest = await PatientClinicalNoteVersion.findOne({ patientId: id })
                    .sort({ version: -1 })
                    .session(session)
                    .lean();
                let nextVersion = latest?.version || 0;
                const ownerUserId = existing.ownerUserId || authUser.userId;

                if (!latest && previousNote) {
                    nextVersion += 1;
                    await PatientClinicalNoteVersion.create(
                        [toClinicalNoteVersion({
                            patientId: id,
                            ownerUserId,
                            version: nextVersion,
                            note: previousNote,
                            changeType: "BASELINE",
                            authUser,
                        })],
                        { session }
                    );
                }

                patient = await Patient.findOneAndUpdate(
                    { _id: id, ...ownerScope },
                    { $set: updatesWithSearchKeys },
                    {
                        new: true,
                        runValidators: true,
                        session,
                    }
                );
                if (!patient) {
                    throw { code: "NOT_FOUND", message: "Patient introuvable." };
                }

                if (Object.hasOwn(preparedUpdates, "secure_request_profile")) {
                    await savePatientSecureRequestSnapshot(
                        patient._id,
                        preparedUpdates.secure_request_profile,
                        { session }
                    );
                }

                nextVersion += 1;
                const [created] = await PatientClinicalNoteVersion.create(
                    [toClinicalNoteVersion({
                        patientId: id,
                        ownerUserId,
                        version: nextVersion,
                        note: nextNote,
                        changeType,
                        restoredFromVersionId,
                        authUser,
                    })],
                    { session }
                );
                noteVersion = created.toObject();
                writeVerification = await recordPatientMutationInTransaction({
                    audit,
                    patientId: patient._id,
                    noteVersion,
                    session,
                });
            },
            { writeConcern: CLINICAL_WRITE_CONCERN }
        );

        return { patient, noteVersion, writeVerification };
    } finally {
        await session.endSession();
    }
}

export async function listPatientClinicalNoteVersions(id, authUser) {
    const patient = await getPatientById(id, authUser);
    const versions = await PatientClinicalNoteVersion.find({ patientId: patient._id })
        .sort({ version: -1 })
        .limit(100)
        .lean();
    return versions.map((version) => ({
        id: String(version._id),
        version: version.version,
        note: version.note,
        changeType: version.changeType,
        restoredFromVersionId: version.restoredFromVersionId
            ? String(version.restoredFromVersionId)
            : null,
        actorUsernameMasked: version.actorUsernameMasked,
        actorRole: version.actorRole,
        createdAt: version.createdAt,
    }));
}

export async function restorePatientClinicalNoteVersion(
    id,
    versionId,
    authUser,
    { audit = null } = {}
) {
    if (!mongoose.Types.ObjectId.isValid(versionId)) {
        throw { code: "INVALID_ID", message: "Identifiant de version invalide." };
    }

    const patient = await getPatientById(id, authUser);
    const source = await PatientClinicalNoteVersion.findOne({
        _id: versionId,
        patientId: patient._id,
    }).lean();
    if (!source) {
        throw { code: "NOT_FOUND", message: "Version de note introuvable." };
    }

    const profile = { ...(patient.secure_request_profile || {}), clinicalNotes: source.note };
    const result = await updatePatientWithClinicalNoteHistory(
        id,
        { secure_request_profile: profile },
        authUser,
        {
            changeType: "RESTORE",
            restoredFromVersionId: source._id,
            forceVersion: true,
            audit,
        }
    );

    return result;
}

export async function archivePatient(id, reason, authUser) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant patient invalide.",
        };
    }

    if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 500) {
        throw {
            code: "INVALID_INPUT",
            message: "Une raison d'archivage valide est requise.",
        };
    }

    const archived = await Patient.findOneAndUpdate(
        {
            _id: id,
            ...buildOwnerScope(authUser),
            archivedAt: null,
        },
        {
            $set: {
                archivedAt: new Date(),
                archivedByUserId: authUser.userId,
                archiveReason: reason.trim(),
            },
        },
        {
            new: true,
            runValidators: true,
            ...CLINICAL_QUERY_WRITE_OPTIONS,
        }
    );

    if (!archived) {
        throw {
            code: "NOT_FOUND",
            message: "Patient introuvable.",
        };
    }

    return archived;
}

export async function archivePatientWithWriteVerification(
    id,
    reason,
    authUser,
    { audit = null } = {}
) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant patient invalide.",
        };
    }

    if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 500) {
        throw {
            code: "INVALID_INPUT",
            message: "Une raison d'archivage valide est requise.",
        };
    }

    return updatePatientArchiveStateWithWriteVerification(id, authUser, {
        query: { archivedAt: null },
        update: {
            archivedAt: new Date(),
            archivedByUserId: authUser.userId,
            archiveReason: reason.trim(),
        },
        notFoundMessage: "Patient introuvable.",
        audit,
    });
}

export async function restorePatient(id, reason, authUser) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant patient invalide.",
        };
    }

    if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 500) {
        throw {
            code: "INVALID_INPUT",
            message: "Une raison de réactivation valide est requise.",
        };
    }

    const restored = await Patient.findOneAndUpdate(
        {
            _id: id,
            ...buildOwnerScope(authUser),
            archivedAt: { $ne: null },
        },
        {
            $set: {
                archivedAt: null,
                archivedByUserId: null,
                archiveReason: "",
            },
        },
        {
            new: true,
            runValidators: true,
            ...CLINICAL_QUERY_WRITE_OPTIONS,
        }
    );

    if (!restored) {
        throw {
            code: "NOT_FOUND",
            message: "Patient archivé introuvable.",
        };
    }

    return restored;
}

export async function restorePatientWithWriteVerification(
    id,
    reason,
    authUser,
    { audit = null } = {}
) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant patient invalide.",
        };
    }

    if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 500) {
        throw {
            code: "INVALID_INPUT",
            message: "Une raison de réactivation valide est requise.",
        };
    }

    return updatePatientArchiveStateWithWriteVerification(id, authUser, {
        query: { archivedAt: { $ne: null } },
        update: {
            archivedAt: null,
            archivedByUserId: null,
            archiveReason: "",
        },
        notFoundMessage: "Patient archivé introuvable.",
        audit,
    });
}
