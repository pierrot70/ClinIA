import mongoose from "mongoose";
import { AdminUser } from "../models/AdminUser.js";
import { Specialist } from "../models/Specialist.js";
import { Patient } from "../models/Patient.js";
import { PatientConsultationNote } from "../models/PatientConsultationNote.js";
import { ClinicalCareAccessGrant } from "../models/ClinicalCareAccessGrant.js";
import { PatientSharedConsultationNote } from "../models/PatientSharedConsultationNote.js";
import { isIps } from "../domain/specialties.js";
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
    const account = await AdminUser.findOne({ _id: userId, role, isActive: true }, { _id: 1, username: 1 }).session(session).lean();
    const directory = account ? await Specialist.findOne({ accountUserId: userId }, { _id: 1, specialite: 1, nom: 1, prenom: 1 }).session(session).lean() : null;
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
    await recordWriteOperationAuditEvent({ collectionName, operation, resourceId: key(resourceId), patientId: key(patientId), changedFields,
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
