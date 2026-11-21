import mongoose from "mongoose";
import { AdminUser } from "../models/AdminUser.js";
import { Clinique } from "../models/Clinique.js";
import { FAMILY_SPECIALTIES, GENERAL_TRANSFER_MAX_CLINICS, clinicIds, extensionDirectory, mayExtend, nextGeneralClinic } from "./generalTransferClinics.js";
import { Specialist } from "../models/Specialist.js";
import { Patient } from "../models/Patient.js";
import { PatientConsultationNote } from "../models/PatientConsultationNote.js";
import { ClinicalCareAccessGrant } from "../models/ClinicalCareAccessGrant.js";
import { PatientCareTransfer } from "../models/PatientCareTransfer.js";
import { PatientSharedConsultationNote } from "../models/PatientSharedConsultationNote.js";
import { IPS_SPECIALTY, URGENTOLOGIST_SPECIALTY, isIps, isUrgentologist } from "../domain/specialties.js";
import { recordPatientAuditEvent } from "../audit/patientAudit.js";
import { recordWriteOperationAuditEvent } from "../audit/writeOperationAudit.js";
import { CLINICAL_WRITE_CONCERN } from "../db/clinicalWriteConcern.js";

const MAX_MINUTES = 24 * 60;
const MAX_NOTES = 500;
const id = value => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
const fail = code => { throw { code }; };
const checkedId = value => { if (!id(value)) fail("INVALID_INPUT"); return value; };
const key = value => String(value?._id ?? value);

function grantDTO(grant) {
    return { _id: key(grant), patientId: key(grant.patientId), issuerUserId: key(grant.issuerUserId), targetUserId: key(grant.targetUserId),
        permission: "READ_APPEND", status: grant.status === "ACTIVE" && new Date(grant.expiresAt) <= new Date() ? "EXPIRED" : grant.status,
        expiresAt: grant.expiresAt, createdAt: grant.createdAt, revokedAt: grant.revokedAt ?? null };
}

// Authentication keeps the real role. No aliasing IPS as MEDECIN and no admin
// exception. Each role must match its currently active professional account.
async function professional(userId, role, session = null) {
    if (!id(userId) || !["IPS", "MEDECIN"].includes(role)) fail("FORBIDDEN");
    const account = await AdminUser.findOne({ _id: userId, role, isActive: true }, { _id: 1, username: 1, acceptsNewPatients: 1 }).session(session).lean();
    const directory = account ? await Specialist.findOne({ accountUserId: userId }, { _id: 1, specialite: 1, nom: 1, prenom: 1, clinique_associer: 1, "practiceLocations.clinique": 1 }).session(session).lean() : null;
    if (!account || !directory || typeof directory.specialite !== "string" || !directory.specialite.trim()
        || (role === "IPS" ? !isIps(directory.specialite) : isIps(directory.specialite))) fail("FORBIDDEN");
    return { account, directory, role };
}

async function actor(auth, role, session = null) {
    if (auth?.role !== role || !id(auth?.userId)) fail("FORBIDDEN");
    return professional(auth.userId, role, session);
}

async function lockProfessional(value, session) {
    const account = await AdminUser.updateOne({ _id: value.account._id, role: value.role, isActive: true }, { $inc: { __v: 1 } }, { session });
    const directory = await Specialist.updateOne({ _id: value.directory._id, accountUserId: value.account._id, specialite: value.directory.specialite }, { $inc: { __v: 1 } }, { session });
    if (account.modifiedCount !== 1 || directory.modifiedCount !== 1) fail("FORBIDDEN");
}

async function lockProfessionals(values, session) {
    for (const value of [...values].sort((a, b) => key(a.account).localeCompare(key(b.account)))) await lockProfessional(value, session);
}

function assertNotExpired(grant) {
    if (!Number.isFinite(new Date(grant.expiresAt).getTime()) || new Date(grant.expiresAt) <= new Date()) fail("FORBIDDEN");
}

async function ownedPatient(patientId, ownerUserId, session = null, lock = false, profile = false) {
    checkedId(patientId);
    const filter = { _id: patientId, ownerUserId, archivedAt: null };
    const projection = { _id: 1, ownerUserId: 1, nom: 1, prenom: 1, ...(profile ? { secure_request_profile: 1 } : {}) };
    const patient = lock
        ? await Patient.findOneAndUpdate(filter, { $inc: { __v: 1 } }, { session, new: true, projection }).lean()
        : await Patient.findOne(filter, projection).session(session).lean();
    if (!patient) fail("FORBIDDEN");
    return patient;
}

async function transaction(work) {
    const session = await mongoose.startSession();
    try { let value; await session.withTransaction(async () => { value = await work(session); }, { writeConcern: CLINICAL_WRITE_CONCERN }); return value; }
    finally { await session.endSession(); }
}

async function writeAudit({ collectionName, operation, resourceId, patientId, changedFields, auth, metadata, session }) {
    await recordWriteOperationAuditEvent({ collectionName, operation, resourceId: key(resourceId), patientId: patientId == null ? null : key(patientId), changedFields,
        actorUserId: auth.userId, actorUsername: auth.username, actorRole: auth.role, ip: metadata.ip ?? null,
        verificationId: metadata.verificationId ?? null, clientMutationId: metadata.clientMutationId ?? null,
        requestId: metadata.requestId ?? null, instanceId: metadata.instanceId ?? null, replicaSet: metadata.replicaSet ?? null,
        requestPath: "/api/clinical-care-access", writeConcern: CLINICAL_WRITE_CONCERN, session, outcome: "SUCCESS", throwOnError: true });
}

async function clinicalAudit(patientId, auth, metadata, session = null, note = false) {
    await recordPatientAuditEvent({ action: note ? "CONSULTATION_NOTE_CREATE" : "CONSULTATION_READ", outcome: "SUCCESS", patientId,
        actorUserId: auth.userId, actorUsername: auth.username, actorRole: auth.role, ip: metadata.ip ?? null,
        requestPath: "/api/clinical-care-access", changedFields: note ? ["sharedConsultationNote"] : [], session, throwOnError: true });
}

export async function listEligibleCareClinicians(auth) {
    await actor(auth, "IPS");
    const accounts = await AdminUser.find({ role: "MEDECIN", isActive: true }, { _id: 1, username: 1 }).sort({ username: 1, _id: 1 }).limit(100).lean();
    if (!accounts.length) return [];
    const directory = await Specialist.find({ accountUserId: { $in: accounts.map(a => a._id) } }, { accountUserId: 1, specialite: 1, nom: 1, prenom: 1 }).lean();
    const byId = new Map(directory.filter(s => typeof s.specialite === "string" && s.specialite.trim() && !isIps(s.specialite)).map(s => [key(s.accountUserId), s]));
    return accounts.flatMap(a => { const s = byId.get(key(a)); return s ? [{ _id: key(a), username: a.username, professional: { nom: s.nom, prenom: s.prenom, specialty: s.specialite } }] : []; });
}

export async function listPatientCareGrants(patientId, auth) {
    await actor(auth, "IPS");
    await ownedPatient(patientId, auth.userId);
    const grants = await ClinicalCareAccessGrant.find({ patientId, issuerUserId: auth.userId }).sort({ createdAt: -1, _id: -1 }).limit(100).lean();
    const targets = grants.length ? await AdminUser.find({ _id: { $in: grants.map(g => g.targetUserId) } }, { _id: 1, username: 1 }).lean() : [];
    const names = new Map(targets.map(a => [key(a), a.username]));
    return grants.map(g => ({ ...grantDTO(g), target: { _id: key(g.targetUserId), username: names.get(key(g.targetUserId)) ?? "" } }));
}

export async function issuePatientCareGrant(patientId, { targetUserId, durationMinutes = 60 } = {}, auth, metadata = {}) {
    checkedId(patientId); checkedId(targetUserId);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > MAX_MINUTES) fail("INVALID_INPUT");
    try {
        return await transaction(async session => {
            const issuer = await actor(auth, "IPS", session);
            const target = await professional(targetUserId, "MEDECIN", session);
            await lockProfessionals([issuer, target], session);
            await ownedPatient(patientId, auth.userId, session, true);
            const now = new Date();
            // Explicitly retain expired history; the partial unique index guards
            // two concurrent invitations for the same owner/patient/recipient.
            const expired = await ClinicalCareAccessGrant.find({ patientId, issuerUserId: auth.userId, targetUserId, status: "ACTIVE", expiresAt: { $lte: now } }, { _id: 1 }).session(session).lean();
            for (const previous of expired) {
                const changed = await ClinicalCareAccessGrant.updateOne({ _id: previous._id, patientId, issuerUserId: auth.userId, targetUserId, status: "ACTIVE", expiresAt: { $lte: now } }, { $set: { status: "EXPIRED" }, $inc: { __v: 1 } }, { session });
                if (changed.modifiedCount !== 1) fail("FORBIDDEN");
                await writeAudit({ collectionName: "clinicalcareaccessgrants", operation: "UPDATE", resourceId: previous._id, patientId,
                    changedFields: ["status"], auth, metadata, session });
            }
            if (await ClinicalCareAccessGrant.exists({ patientId, issuerUserId: auth.userId, targetUserId, status: "ACTIVE", expiresAt: { $gt: now } }).session(session)) fail("CARE_ACCESS_ALREADY_ACTIVE");
            const [grant] = await ClinicalCareAccessGrant.create([{ patientId, issuerUserId: auth.userId, targetUserId, permission: "READ_APPEND", status: "ACTIVE", expiresAt: new Date(now.getTime() + durationMinutes * 60000) }], { session });
            await writeAudit({ collectionName: "clinicalcareaccessgrants", operation: "CREATE", resourceId: grant._id, patientId,
                changedFields: ["targetUserId", "permission", "status", "expiresAt"], auth, metadata, session });
            return { data: grantDTO(grant), writeAuditRecorded: true };
        });
    } catch (error) {
        if (error?.code === 11000 && error.keyPattern && ["patientId", "issuerUserId", "targetUserId"].every(k => error.keyPattern[k] === 1)) fail("CARE_ACCESS_ALREADY_ACTIVE");
        throw error;
    }
}

export async function revokePatientCareGrant(grantId, auth, metadata = {}) {
    checkedId(grantId);
    return transaction(async session => {
        const issuer = await actor(auth, "IPS", session);
        await lockProfessional(issuer, session);
        const grant = await ClinicalCareAccessGrant.findOne({ _id: grantId, issuerUserId: auth.userId, status: "ACTIVE" }).session(session).lean();
        if (!grant) fail("FORBIDDEN");
        await ownedPatient(key(grant.patientId), auth.userId, session, true);
        const changed = await ClinicalCareAccessGrant.findOneAndUpdate({ _id: grantId, issuerUserId: auth.userId, status: "ACTIVE" }, { $set: { status: "REVOKED", revokedAt: new Date() }, $inc: { __v: 1 } }, { session, new: true }).lean();
        if (!changed) fail("FORBIDDEN");
        await writeAudit({ collectionName: "clinicalcareaccessgrants", operation: "UPDATE", resourceId: grantId, patientId: grant.patientId, changedFields: ["status", "revokedAt"], auth, metadata, session });
        return { data: grantDTO(changed), writeAuditRecorded: true };
    });
}

export async function listIncomingCareGrants(auth, metadata = {}) {
    await actor(auth, "MEDECIN");
    const grants = await ClinicalCareAccessGrant.find({ targetUserId: auth.userId, status: "ACTIVE", permission: "READ_APPEND", expiresAt: { $gt: new Date() } }).sort({ expiresAt: 1, _id: 1 }).limit(100).lean();
    const results = [];
    for (const grant of grants) {
        try {
            const issuer = await professional(key(grant.issuerUserId), "IPS");
            const patient = await ownedPatient(key(grant.patientId), key(grant.issuerUserId));
            results.push({ ...grantDTO(grant), patient: { _id: key(patient), nom: patient.nom, prenom: patient.prenom }, issuer: { _id: key(issuer.account), username: issuer.account.username } });
        } catch (error) { if (error?.code !== "FORBIDDEN") throw error; }
    }
    await clinicalAudit(null, auth, metadata);
    return results;
}

async function authorizedGrant(grantId, auth, session, profile = false) {
    checkedId(grantId);
    const recipient = await actor(auth, "MEDECIN", session);
    const grant = await ClinicalCareAccessGrant.findOne({ _id: grantId, targetUserId: auth.userId, status: "ACTIVE", permission: "READ_APPEND", expiresAt: { $gt: new Date() } }).session(session).lean();
    if (!grant) fail("FORBIDDEN");
    const issuer = await professional(key(grant.issuerUserId), "IPS", session);
    await lockProfessionals([recipient, issuer], session);
    const patient = await ownedPatient(key(grant.patientId), key(grant.issuerUserId), session, true, profile);
    // A concurrent revocation or expiry prevents a note/read transaction from
    // succeeding against a previously observed invitation.
    const locked = await ClinicalCareAccessGrant.updateOne({ _id: grantId, targetUserId: auth.userId, issuerUserId: grant.issuerUserId,
        patientId: grant.patientId, status: "ACTIVE", permission: "READ_APPEND", expiresAt: { $gt: new Date() } }, { $inc: { __v: 1 } }, { session });
    if (locked.modifiedCount !== 1) fail("FORBIDDEN");
    return { grant, patient, recipient };
}

const PROFILE_FIELDS = ["objective", "sex", "age", "current_medications", "clinicalAnalysisParameters", "clinicalScope", "ageGroup", "symptomProfile", "cancerType", "duration", "severity", "redFlagStatus", "comorbidityContext", "clinicalNotes"];
function clinicalProfile(value) {
    return Object.fromEntries(PROFILE_FIELDS.filter(k => value?.[k] !== undefined).map(k => [k, value[k]]));
}

async function attributedNotes(patientId, session = null, includeOriginal = true) {
    const originals = includeOriginal ? await PatientConsultationNote.find({ patientId }, { _id: 1, note: 1, authorUserId: 1, appointmentId: 1, createdAt: 1 }).session(session).sort({ createdAt: 1, _id: 1 }).limit(MAX_NOTES + 1).lean() : [];
    const shared = await PatientSharedConsultationNote.find({ patientId }, { _id: 1, note: 1, authorUserId: 1, authorRole: 1, authorSpecialty: 1, createdAt: 1 }).session(session).sort({ createdAt: 1, _id: 1 }).limit(MAX_NOTES + 1).lean();
    const ids = [...new Set([...originals, ...shared].map(n => key(n.authorUserId)))];
    const authors = ids.length ? await AdminUser.find({ _id: { $in: ids } }, { _id: 1, username: 1 }).session(session).lean() : [];
    const names = new Map(authors.map(a => [key(a), a.username]));
    const present = (note, original) => ({ _id: key(note), note: note.note, authorUserId: key(note.authorUserId),
        authorRole: original ? null : note.authorRole, ...(original ? { appointmentId: key(note.appointmentId) } : { authorSpecialty: note.authorSpecialty }),
        createdAt: note.createdAt, author: { _id: key(note.authorUserId), username: names.get(key(note.authorUserId)) ?? "" } });
    return { originalNotes: originals.slice(0, MAX_NOTES).map(n => present(n, true)), sharedNotes: shared.slice(0, MAX_NOTES).map(n => present(n, false)), notesTruncated: originals.length > MAX_NOTES || shared.length > MAX_NOTES };
}

export async function readSharedCareRecord(grantId, auth, metadata = {}) {
    return transaction(async session => {
        const { grant, patient } = await authorizedGrant(grantId, auth, session, true);
        const notes = await attributedNotes(patient._id, session);
        assertNotExpired(grant);
        await clinicalAudit(patient._id, auth, metadata, session);
        assertNotExpired(grant);
        return { grant: grantDTO(grant), patient: { _id: key(patient), nom: patient.nom, prenom: patient.prenom }, profile: clinicalProfile(patient.secure_request_profile), ...notes, canAppendNote: true };
    });
}

export async function listOwnedSharedCareNotes(patientId, auth, metadata = {}) {
    await actor(auth, "IPS");
    await ownedPatient(patientId, auth.userId);
    const { sharedNotes, notesTruncated } = await attributedNotes(patientId, null, false);
    await clinicalAudit(patientId, auth, metadata);
    return { sharedNotes, notesTruncated };
}

export async function appendSharedCareNote(grantId, note, auth, metadata = {}) {
    if (typeof note !== "string" || !note.trim() || note.length > 20000) fail("INVALID_INPUT");
    return transaction(async session => {
        const { grant, patient, recipient } = await authorizedGrant(grantId, auth, session);
        const [entry] = await PatientSharedConsultationNote.create([{ patientId: patient._id, grantId: grant._id,
            authorUserId: auth.userId, authorRole: auth.role, authorSpecialty: recipient.directory.specialite, note: note.trim() }], { session });
        assertNotExpired(grant);
        await clinicalAudit(patient._id, auth, metadata, session, true);
        await writeAudit({ collectionName: "patientsharedconsultationnotes", operation: "CREATE", resourceId: entry._id, patientId: patient._id,
            changedFields: ["sharedConsultationNote"], auth, metadata, session });
        assertNotExpired(grant);
        return { data: { _id: key(entry) }, writeAuditRecorded: true };
    });
}

const TRANSFER_DURATION_MS = MAX_MINUTES * 60000;
const GENERAL_REMINDER_MS = 48 * 60 * 60 * 1000;
const GENERAL_PENDING = { kind: "GENERAL", status: "PENDING", targetUserId: null };

function transferDTO(transfer, sender = false, nextClinic = null) {
    const general = transfer.kind === "GENERAL";
    const reminderAt = general && sender && transfer.contactedClinics?.length && transfer.status === "PENDING"
        ? new Date(new Date(transfer.createdAt).getTime() + GENERAL_REMINDER_MS) : null;
    return {
        kind: transfer.kind ?? "DIRECT", reminderAt, reminderDue: reminderAt !== null && reminderAt <= new Date(),
        ...(general && sender ? {
            contactedClinics: (transfer.contactedClinics ?? []).map(entry => ({
                _id: key(entry.clinicId), nom: entry.nom, consentRecordedAt: entry.consentRecordedAt,
            })),
            nextClinic, maxClinics: GENERAL_TRANSFER_MAX_CLINICS,
        } : {}),
        _id: key(transfer),
        patientId: transfer.patientId ? key(transfer.patientId) : null,
        targetUserId: transfer.targetUserId ? key(transfer.targetUserId) : null,
        status: !general && transfer.status === "PENDING" && new Date(transfer.expiresAt) <= new Date() ? "EXPIRED" : transfer.status,
        createdAt: transfer.createdAt,
        expiresAt: transfer.expiresAt ?? null,
        consentRecordedAt: transfer.consentRecordedAt,
        resolvedAt: transfer.resolvedAt,
    };
}

const transferPatient = patient => ({ _id: key(patient), nom: patient.nom, prenom: patient.prenom });

function canInitiateTransfer(professional) {
    return professional.role === "IPS" || isUrgentologist(professional.directory.specialite);
}

async function transferIssuer(userId, role, session = null) {
    const issuer = await professional(userId, role, session);
    if (!canInitiateTransfer(issuer)) fail("FORBIDDEN");
    return issuer;
}

export async function getTransferCapabilities(auth) {
    const identity = await professional(auth?.userId, auth?.role);
    return {
        canInitiate: canInitiateTransfer(identity),
        acceptsNewPatients: FAMILY_SPECIALTIES.includes(identity.directory.specialite) ? identity.account.acceptsNewPatients === true : null,
    };
}

async function familyPhysician(userId, session = null) {
    const target = await professional(userId, "MEDECIN", session);
    if (!FAMILY_SPECIALTIES.includes(target.directory.specialite)) fail("FORBIDDEN");
    return target;
}

export async function setTransferPreference(acceptsNewPatients, auth, metadata = {}) {
    if (auth?.role !== "MEDECIN") fail("FORBIDDEN");
    if (typeof acceptsNewPatients !== "boolean") fail("INVALID_INPUT");
    return transaction(async session => {
        const physician = await familyPhysician(auth.userId, session);
        await lockProfessional(physician, session);
        await AdminUser.updateOne({ _id: auth.userId }, { $set: { acceptsNewPatients } }, { session });
        await writeAudit({ collectionName: "adminusers", operation: "UPDATE", resourceId: auth.userId,
            changedFields: ["acceptsNewPatients"], auth, metadata, session });
        return { data: { acceptsNewPatients }, writeAuditRecorded: true };
    });
}

async function transferClinicScope(issuer, requestedId, session = null) {
    if (requestedId !== undefined) checkedId(requestedId);
    const affiliations = clinicIds(issuer.directory);
    const clinics = await Clinique.find({ _id: { $in: affiliations } }, { nom: 1 })
        .sort({ nom: 1, _id: 1 }).session(session).lean();
    const clinicId = requestedId?.toLowerCase() ?? (clinics.length === 1 ? key(clinics[0]) : null);
    if (clinicId && !clinics.some(clinic => key(clinic) === clinicId)) fail("FORBIDDEN");
    return { clinics: clinics.map(clinic => ({ _id: key(clinic), nom: clinic.nom })), clinicId };
}

async function availableFamilyPhysicians(clinicId, session = null) {
    const directory = await Specialist.find({
        specialite: { $in: FAMILY_SPECIALTIES }, accountUserId: { $type: "objectId" },
        $or: [
            { "practiceLocations.clinique": clinicId },
            { "practiceLocations.0": { $exists: false }, clinique_associer: clinicId },
        ],
    }, { accountUserId: 1, nom: 1, prenom: 1 }).sort({ nom: 1, prenom: 1, _id: 1 }).session(session).lean();
    if (!directory.length) return [];
    const accounts = await AdminUser.find({
        _id: { $in: directory.map(entry => entry.accountUserId) }, role: "MEDECIN", isActive: true, acceptsNewPatients: true,
    }, { username: 1 }).session(session).lean();
    const byAccount = new Map(accounts.map(account => [key(account), account.username]));
    return directory.filter(entry => byAccount.has(key(entry.accountUserId))).map(entry => ({
        _id: key(entry.accountUserId), nom: entry.nom, prenom: entry.prenom, username: byAccount.get(key(entry.accountUserId)),
    }));
}

export async function getCareTransferContext(patientId, auth, requestedClinicId) {
    const issuer = await transferIssuer(auth?.userId, auth?.role);
    const patient = await ownedPatient(patientId, auth.userId);
    const scope = await transferClinicScope(issuer, requestedClinicId);
    const clinicians = scope.clinicId ? await availableFamilyPhysicians(scope.clinicId) : [];
    return { patient: transferPatient(patient), ...scope, clinicians };
}

// Only the invitation ID and its creation time may leave this query. Even
// temporarily, a broadcast is hidden once the patient is archived, reassigned,
// or the original issuer no longer has an eligible active professional account.
function openGeneralInvitations(identity, recipientClinics = []) {
    const sender = canInitiateTransfer(identity);
    const match = sender
        ? { ...GENERAL_PENDING, issuerUserId: identity.account._id, issuerRole: identity.role, "contactedClinics.0": { $exists: true } }
        : { ...GENERAL_PENDING, "contactedClinics.clinicId": { $in: recipientClinics } };
    const pipeline = [
        { $match: match },
        { $sort: { createdAt: 1, _id: 1 } },
        { $lookup: {
            from: Patient.collection.name, localField: "patientId", foreignField: "_id",
            let: { owner: "$issuerUserId" },
            pipeline: [{ $match: { archivedAt: null, $expr: { $eq: ["$ownerUserId", "$$owner"] } } }, { $project: { _id: 1 } }],
            as: "ownedPatient",
        } },
        { $match: { "ownedPatient.0": { $exists: true } } },
    ];
    if (!sender) {
        pipeline.push(
            { $lookup: {
                from: AdminUser.collection.name, localField: "issuerUserId", foreignField: "_id",
                let: { issuerRole: "$issuerRole" },
                pipeline: [{ $match: { isActive: true, role: { $in: ["IPS", "MEDECIN"] }, $expr: { $eq: ["$role", "$$issuerRole"] } } }, { $project: { _id: 1 } }],
                as: "activeAccount",
            } },
            { $match: { "activeAccount.0": { $exists: true } } },
            { $lookup: {
                from: Specialist.collection.name, localField: "issuerUserId", foreignField: "accountUserId",
                let: { specialty: { $cond: [{ $eq: ["$issuerRole", "IPS"] }, IPS_SPECIALTY.toLowerCase(), URGENTOLOGIST_SPECIALTY.toLowerCase()] } },
                pipeline: [{ $match: { $expr: { $eq: [{ $toLower: { $trim: { input: { $ifNull: ["$specialite", ""] } } } }, "$$specialty"] } } }, { $project: { _id: 1 } }],
                as: "eligibleProfessional",
            } },
            { $match: { "eligibleProfessional.0": { $exists: true } } },
        );
    }
    pipeline.push({ $project: { _id: 1, createdAt: 1 } });
    return PatientCareTransfer.aggregate(pipeline);
}

// Aggregation does not cast strings to ObjectIds. Removed clinics and stale directory
// references must not grant access to an outstanding general invitation.
async function currentRecipientClinics(recipient, session = null) {
    return Clinique.distinct("_id", { _id: { $in: clinicIds(recipient.directory) } }).session(session);
}

export async function getTransferReminder(auth) {
    const identity = await professional(auth?.userId, auth?.role);
    const result = { overdueCount: 0, nextReminderAt: null, incomingGeneral: false };
    if (canInitiateTransfer(identity)) {
        const threshold = new Date(Date.now() - GENERAL_REMINDER_MS);
        const [counts] = await openGeneralInvitations(identity).append({ $facet: {
            overdue: [{ $match: { createdAt: { $lte: threshold } } }, { $count: "count" }],
            upcoming: [{ $match: { createdAt: { $gt: threshold } } }, { $limit: 1 }],
        } });
        result.overdueCount = counts.overdue[0]?.count ?? 0;
        if (counts.upcoming.length) result.nextReminderAt = new Date(counts.upcoming[0].createdAt.getTime() + GENERAL_REMINDER_MS);
    } else if (FAMILY_SPECIALTIES.includes(identity.directory.specialite)) {
        result.incomingGeneral = (await openGeneralInvitations(identity, await currentRecipientClinics(identity)).limit(1)).length !== 0;
    }
    return result;
}

export async function listCareTransfers(auth, metadata = {}) {
    const identity = await professional(auth?.userId, auth?.role);
    const sender = canInitiateTransfer(identity);
    if (!sender && !FAMILY_SPECIALTIES.includes(identity.directory.specialite)) return [];
    // Before urgentologists could initiate transfers, every issuer was an IPS.
    const scope = sender ? {
        issuerUserId: auth.userId,
        issuerRole: identity.role === "IPS" ? { $in: ["IPS", null] } : identity.role,
    } : { targetUserId: auth.userId };
    const now = new Date();
    const open = { status: "PENDING", $or: [GENERAL_PENDING, { expiresAt: { $gt: now } }] };
    const history = sender ? { $or: [
        { status: { $ne: "PENDING" } }, { status: "PENDING", expiresAt: { $lte: now } },
    ] } : { status: "ACCEPTED" };
    // An open request remains actionable regardless of the size of the history.
    const [pending, recentHistory] = await Promise.all([
        PatientCareTransfer.find({ ...scope, ...open }).sort({ createdAt: -1, _id: -1 }).lean(),
        PatientCareTransfer.find({ ...scope, ...history }).sort({ createdAt: -1, _id: -1 }).limit(100).lean(),
    ]);
    // A decision can commit between the two reads. Prefer the final status.
    const transfers = new Map([...pending, ...recentHistory].map(row => [key(row), row]));
    const directory = sender && pending.some(transfer => mayExtend(transfer, identity))
        ? await extensionDirectory(identity) : null;
    const results = [];
    for (const transfer of transfers.values()) {
        try {
            const expectedOwner = transfer.status === "ACCEPTED" ? key(transfer.targetUserId) : key(transfer.issuerUserId);
            // The issuer can keep the decision history after transfer, without retaining patient identity access.
            const patient = sender && transfer.status === "ACCEPTED" ? null : await ownedPatient(key(transfer.patientId), expectedOwner);
            if (!sender && transfer.status === "PENDING") {
                await transferIssuer(key(transfer.issuerUserId), transfer.issuerRole ?? "IPS");
                assertNotExpired(transfer);
            }
            const other = await AdminUser.findById(sender ? transfer.targetUserId : transfer.issuerUserId, { username: 1 }).lean();
            const next = directory && mayExtend(transfer, identity) ? nextGeneralClinic(transfer, directory) : null;
            results.push({ ...transferDTO(transfer, sender, next), patient: patient ? transferPatient(patient) : null, professional: other?.username ?? "" });
        } catch (error) { if (error?.code !== "FORBIDDEN") throw error; }
    }
    if (!sender) {
        for (const invitation of await openGeneralInvitations(identity, await currentRecipientClinics(identity))) {
            results.push({
                ...transferDTO({ ...invitation, kind: "GENERAL", status: "PENDING" }),
                patient: null, professional: "",
            });
        }
    }
    await clinicalAudit(null, auth, metadata);
    return results;
}

async function transferAudit(transfer, operation, changedFields, auth, metadata, session) {
    await writeAudit({ collectionName: "patientcaretransfers", operation, resourceId: transfer._id,
        patientId: transfer.patientId, changedFields, auth, metadata, session });
}

export function requestCareTransfer(patientId, { targetUserId, patientConsent, clinicId } = {}, auth, metadata = {}) {
    return createTransfer(patientId, checkedId(targetUserId), patientConsent, clinicId, auth, metadata);
}

export function requestGeneralTransfer(patientId, { patientConsent, clinicId } = {}, auth, metadata = {}) {
    return createTransfer(patientId, null, patientConsent, clinicId, auth, metadata);
}

async function createTransfer(patientId, targetUserId, patientConsent, requestedClinicId, auth, metadata) {
    checkedId(patientId);
    if (patientConsent !== true) fail("TRANSFER_CONSENT_REQUIRED");
    try {
        return await transaction(async session => {
            const issuer = await transferIssuer(auth?.userId, auth?.role, session);
            const target = targetUserId ? await familyPhysician(targetUserId, session) : null;
            await lockProfessionals(target ? [issuer, target] : [issuer], session);
            await ownedPatient(patientId, auth.userId, session, true);
            const { clinics, clinicId } = await transferClinicScope(issuer, requestedClinicId, session);
            if (!clinicId) fail("TRANSFER_CLINIC_REQUIRED");
            if (target) {
                const local = clinicIds(target.directory).includes(clinicId);
                if (!local || target.account.acceptsNewPatients !== true) fail("TRANSFER_RECIPIENT_UNAVAILABLE");
            }
            const now = new Date();
            const expired = await PatientCareTransfer.findOneAndUpdate(
                { patientId, status: "PENDING", expiresAt: { $lte: now } },
                { $set: { status: "EXPIRED", resolvedAt: now } }, { session, returnDocument: "after" },
            ).lean();
            if (expired) await transferAudit(expired, "UPDATE", ["status", "resolvedAt"], auth, metadata, session);
            if (await PatientCareTransfer.exists({ patientId, status: "PENDING" }).session(session)) fail("TRANSFER_ALREADY_PENDING");
            const [transfer] = await PatientCareTransfer.create([{
                patientId, issuerUserId: auth.userId, issuerRole: issuer.role, consentRecordedAt: now,
                ...(target ? { kind: "DIRECT", targetUserId, expiresAt: new Date(now.getTime() + TRANSFER_DURATION_MS) } : {
                    kind: "GENERAL", contactedClinics: [{ clinicId, nom: clinics.find(clinic => clinic._id === clinicId).nom, consentRecordedAt: now }],
                }),
            }], { session });
            await transferAudit(transfer, "CREATE", ["kind", "issuerRole", "consentRecordedAt", "status", ...(target ? ["targetUserId", "expiresAt"] : ["contactedClinics"])], auth, metadata, session);
            const next = mayExtend(transfer, issuer) ? nextGeneralClinic(transfer, await extensionDirectory(issuer, session)) : null;
            return { data: transferDTO(transfer, true, next), writeAuditRecorded: true };
        });
    } catch (error) {
        if (error?.code === 11000 && error.keyPattern?.patientId === 1) fail("TRANSFER_ALREADY_PENDING");
        throw error;
    }
}

export async function extendGeneralTransfer(transferId, { clinicId, patientConsent } = {}, auth, metadata = {}) {
    checkedId(transferId); checkedId(clinicId);
    if (patientConsent !== true) fail("TRANSFER_CONSENT_REQUIRED");
    return transaction(async session => {
        const issuer = await transferIssuer(auth?.userId, auth?.role, session);
        await lockProfessional(issuer, session);
        const scope = { _id: transferId, issuerUserId: auth.userId, issuerRole: issuer.role, ...GENERAL_PENDING };
        const transfer = await PatientCareTransfer.findOne(scope).session(session).lean();
        if (!transfer) fail("FORBIDDEN");
        await ownedPatient(key(transfer.patientId), auth.userId, session, true);
        const origin = transfer.contactedClinics?.[0];
        if (!origin) fail("TRANSFER_EXTENSION_UNAVAILABLE");
        await transferClinicScope(issuer, key(origin.clinicId), session);
        if (!mayExtend(transfer, issuer)) fail("TRANSFER_EXTENSION_UNAVAILABLE");
        const directory = await extensionDirectory(issuer, session);
        const next = nextGeneralClinic(transfer, directory);
        if (next?._id !== clinicId.toLowerCase()) fail("TRANSFER_EXTENSION_UNAVAILABLE");
        const changed = await PatientCareTransfer.findOneAndUpdate({
            ...scope, "contactedClinics.clinicId": { $ne: next._id },
            [`contactedClinics.${transfer.contactedClinics.length}`]: { $exists: false },
        }, { $push: { contactedClinics: { clinicId: next._id, nom: next.nom, consentRecordedAt: new Date() } } },
        { session, returnDocument: "after", runValidators: true }).lean();
        if (!changed) fail("TRANSFER_EXTENSION_UNAVAILABLE");
        await transferAudit(changed, "UPDATE", ["contactedClinics"], auth, metadata, session);
        return { data: transferDTO(changed, true, mayExtend(changed, issuer) ? nextGeneralClinic(changed, directory) : null), writeAuditRecorded: true };
    });
}

async function targetTransfer(transferId, auth, session, action) {
    checkedId(transferId);
    if (auth?.role !== "MEDECIN") fail("FORBIDDEN");
    const recipient = await familyPhysician(auth.userId, session);
    const eligible = [{ kind: { $ne: "GENERAL" }, targetUserId: auth.userId, status: "PENDING", expiresAt: { $gt: new Date() } }];
    if (action === "read") eligible.push({ targetUserId: auth.userId, status: "ACCEPTED" });
    if (action === "accept") eligible.push({
        ...GENERAL_PENDING, "contactedClinics.clinicId": { $in: await currentRecipientClinics(recipient, session) },
    });
    const transfer = await PatientCareTransfer.findOne({ _id: transferId, $or: eligible }).session(session).lean();
    if (!transfer) fail("FORBIDDEN");
    const pending = transfer.status === "PENDING";
    const issuer = pending ? await transferIssuer(key(transfer.issuerUserId), transfer.issuerRole ?? "IPS", session) : null;
    await lockProfessionals(issuer ? [recipient, issuer] : [recipient], session);
    const patient = await ownedPatient(key(transfer.patientId), pending ? key(transfer.issuerUserId) : auth.userId, session, true, action === "read");
    return { transfer, patient };
}

export async function readCareTransferRecord(transferId, auth, metadata = {}) {
    return transaction(async session => {
        const { transfer, patient } = await targetTransfer(transferId, auth, session, "read");
        const notes = await attributedNotes(patient._id, session);
        await clinicalAudit(patient._id, auth, metadata, session);
        if (transfer.status === "PENDING") assertNotExpired(transfer);
        return { transfer: transferDTO(transfer), patient: transferPatient(patient), profile: clinicalProfile(patient.secure_request_profile), ...notes };
    });
}

async function resolveTransfer(transfer, status, auth, metadata, session) {
    const now = new Date();
    const general = transfer.kind === "GENERAL";
    const open = general ? GENERAL_PENDING : { status: "PENDING", expiresAt: { $gt: now } };
    const changes = { status, resolvedAt: now };
    if (general && status === "ACCEPTED") changes.targetUserId = auth.userId;
    const changed = await PatientCareTransfer.findOneAndUpdate({
        _id: transfer._id, ...open,
    }, { $set: changes }, { session, returnDocument: "after" }).lean();
    if (!changed) fail("FORBIDDEN");
    await transferAudit(changed, "UPDATE", Object.keys(changes), auth, metadata, session);
    if (!general) assertNotExpired(transfer);
    return { data: transferDTO(changed), writeAuditRecorded: true };
}

export async function decideCareTransfer(transferId, { decision } = {}, auth, metadata = {}) {
    if (!["accept", "decline"].includes(decision)) fail("INVALID_INPUT");
    try {
        return await transaction(async session => {
            const { transfer, patient } = await targetTransfer(transferId, auth, session, decision);
            if (decision === "decline") return resolveTransfer(transfer, "DECLINED", auth, metadata, session);
            const changed = await Patient.updateOne({ _id: patient._id, ownerUserId: transfer.issuerUserId, archivedAt: null },
                { $set: { ownerUserId: auth.userId } }, { session });
            if (changed.modifiedCount !== 1) fail("FORBIDDEN");
            await writeAudit({ collectionName: "patients", operation: "UPDATE", resourceId: patient._id, patientId: patient._id,
                changedFields: ["ownerUserId"], auth, metadata, session });
            await recordPatientAuditEvent({ action: "PATIENT_CARE_ACCEPT", outcome: "SUCCESS", patientId: patient._id,
                actorUserId: auth.userId, actorUsername: auth.username, actorRole: auth.role, ip: metadata.ip ?? null,
                requestPath: "/api/clinical-care-access", changedFields: ["ownerUserId"], session, throwOnError: true });
            return resolveTransfer(transfer, "ACCEPTED", auth, metadata, session);
        });
    } catch (error) {
        if (error?.code === 11000 && error.keyPattern?.ownerUserId === 1) fail("TRANSFER_PATIENT_CONFLICT");
        throw error;
    }
}

export async function cancelCareTransfer(transferId, auth, metadata = {}) {
    checkedId(transferId);
    return transaction(async session => {
        const issuer = await transferIssuer(auth?.userId, auth?.role, session);
        await lockProfessional(issuer, session);
        const transfer = await PatientCareTransfer.findOne({
            _id: transferId, issuerUserId: auth.userId, status: "PENDING", $or: [GENERAL_PENDING, { expiresAt: { $gt: new Date() } }],
        }).session(session).lean();
        if (!transfer || (transfer.issuerRole ?? "IPS") !== issuer.role) fail("FORBIDDEN");
        await ownedPatient(key(transfer.patientId), auth.userId, session, true);
        return resolveTransfer(transfer, "CANCELLED", auth, metadata, session);
    });
}
