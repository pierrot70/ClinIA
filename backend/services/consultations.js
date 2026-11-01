import mongoose from "mongoose";
import { AdminUser } from "../models/AdminUser.js";
import { Specialist } from "../models/Specialist.js";
import { Appointment } from "../models/Appointment.js";
import { Patient } from "../models/Patient.js";
import { PatientConsultationNote } from "../models/PatientConsultationNote.js";
import { PatientSharedConsultationNote } from "../models/PatientSharedConsultationNote.js";
import { recordPatientAuditEvent } from "../audit/patientAudit.js";
import { CLINICAL_WRITE_CONCERN } from "../db/clinicalWriteConcern.js";

const MAX_SHARED_NOTES = 500;
const fail = (code) => { throw { code }; };
const id = (value) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);

async function physicianSpecialists(auth, session = null) {
    if (!["MEDECIN", "IPS"].includes(auth?.role) || !id(auth?.userId)) fail("FORBIDDEN");
    const active = await AdminUser.findOne({ _id: auth.userId, role: auth.role, isActive: true }, { _id: 1 }).session(session).lean();
    if (!active) fail("FORBIDDEN");
    const specialists = await Specialist.find({ accountUserId: auth.userId, ...(auth.role === "IPS" ? { specialite: "IPS" } : {}) }, { _id: 1 }).session(session).lean();
    if (auth.role === "IPS" && !specialists.length) fail("FORBIDDEN");
    return specialists.map((entry) => entry._id);
}

async function access(appointmentId, auth, session = null) {
    if (!id(appointmentId)) fail("INVALID_INPUT");
    const specialists = await physicianSpecialists(auth, session);
    const appointment = await Appointment.findOne({
        _id: appointmentId, specialist: { $in: specialists },
        ...(auth.role === "IPS" ? { ownerUserId: auth.userId } : {}),
        status: { $in: ["scheduled", "completed"] },
    }, { patient: 1, status: 1, date: 1, time: 1, ...(auth.role === "IPS" ? { specialist: 1, ownerUserId: 1 } : {}) }).session(session).lean();
    // Deliberately indistinguishable missing/unrelated/cancelled appointment.
    if (!appointment) fail("FORBIDDEN");
    // This exact assigned encounter authorizes consultation access without
    // changing the professional responsible for the patient's dossier.
    const patient = await Patient.findOne({ _id: appointment.patient, archivedAt: null }, {
        nom: 1, prenom: 1, ownerUserId: 1, "secure_request_profile.clinicalNotes": 1,
    }).session(session).lean();
    if (!patient) fail("FORBIDDEN");
    const inCare = String(patient.ownerUserId || "") === auth.userId;
    return { appointment, patient, inCare, fullHistory: appointment.status === "scheduled" || inCare };
}

async function lockAuthorization(appointment, patient, auth, session) {
    // Serialize writes against account deactivation, specialist relinking,
    // appointment changes and patient archival. Transactions retry conflicts.
    const specialists = await Specialist.find({ accountUserId: auth.userId, ...(auth.role === "IPS" ? { specialite: "IPS" } : {}) }, { _id: 1 }).session(session).lean();
    const checks = [
        [AdminUser, { _id: auth.userId, role: auth.role, isActive: true }],
        [Specialist, { _id: auth.role === "IPS" ? appointment.specialist : { $in: specialists.map(s => s._id) }, accountUserId: auth.userId,
            ...(auth.role === "IPS" ? { specialite: "IPS" } : {}) }],
        [Appointment, { _id: appointment._id, status: appointment.status,
            ...(auth.role === "IPS" ? { ownerUserId: auth.userId, specialist: { $in: specialists.map(s => s._id) } } : {}) }],
        [Patient, { _id: patient._id, archivedAt: null,
            ...(auth.role === "IPS" ? { ownerUserId: patient.ownerUserId ?? null } : {}) }],
    ];
    for (const [model, filter] of checks) {
        const result = await model.updateOne(filter, { $inc: { __v: 1 } }, { session });
        if (result.modifiedCount !== 1) fail("FORBIDDEN");
    }
}

async function audit(action, patient, auth, metadata, session = null) {
    await recordPatientAuditEvent({
        action, outcome: "SUCCESS", patientId: patient._id,
        actorUserId: auth.userId, actorRole: auth.role, actorUsername: auth.username,
        ip: metadata.ip, requestPath: "/api/consultations", session, throwOnError: true,
        changedFields: action === "PATIENT_CARE_ACCEPT" ? ["ownerUserId"] :
            action === "CONSULTATION_NOTE_CREATE" ? ["consultationNote"] : [],
    });
}

export async function listConsultations(auth, metadata = {}) {
    const specialists = await physicianSpecialists(auth);
    const appointments = await Appointment.find({ specialist: { $in: specialists }, ...(auth.role === "IPS" ? { ownerUserId: auth.userId } : {}), status: { $in: ["scheduled", "completed"] } }, {
        patient: 1, date: 1, time: 1, status: 1,
    }).sort({ date: -1, time: -1, _id: -1 }).limit(100).lean();
    const patients = await Patient.find({ _id: { $in: appointments.map(a => a.patient) }, archivedAt: null }, { nom: 1, prenom: 1 }).lean();
    const byId = new Map(patients.map(p => [String(p._id), p]));
    // Only identifiers needed to select an assigned encounter; no RAMQ/profile.
    await audit("CONSULTATION_READ", { _id: null }, auth, metadata);
    return appointments.filter(a => byId.has(String(a.patient))).map(({ _id, date, time, status, patient }) => ({
        _id, date, time, status, patient: byId.get(String(patient)),
    }));
}

export async function readConsultation(appointmentId, auth, metadata = {}) {
    const { appointment, patient, inCare, fullHistory } = await access(appointmentId, auth);
    const filter = { patientId: patient._id, ...(!fullHistory ? { authorUserId: auth.userId, appointmentId } : {}) };
    const encounterNotes = await PatientConsultationNote.find(filter, { note: 1, authorUserId: 1, appointmentId: 1, createdAt: 1 })
        .sort({ createdAt: 1, _id: 1 }).lean();
    // Shared consultation entries remain part of the dossier after the access
    // invitation expires or is revoked. Only the existing full-history policy
    // authorizes them here; completed foreign encounters never query this set.
    const sharedNotes = fullHistory ? await PatientSharedConsultationNote.find({ patientId: patient._id }, {
        note: 1, authorUserId: 1, authorRole: 1, authorSpecialty: 1, createdAt: 1,
    }).sort({ createdAt: -1, _id: -1 }).limit(MAX_SHARED_NOTES + 1).lean() : [];
    const sharedNotesTruncated = fullHistory && sharedNotes.length > MAX_SHARED_NOTES;
    const notes = [
        ...encounterNotes.map(note => ({ ...note, source: "CONSULTATION", authorRole: null, authorSpecialty: null })),
        ...sharedNotes.slice(0, MAX_SHARED_NOTES).map(note => ({ ...note, source: "SHARED", appointmentId: null })),
    ].sort((a, b) => (new Date(a.createdAt).getTime() || 0) - (new Date(b.createdAt).getTime() || 0)
        || String(a._id).localeCompare(String(b._id)));
    const authors = await AdminUser.find({ _id: { $in: notes.map(n => n.authorUserId) } }, { username: 1 }).lean();
    const authorNames = new Map(authors.map(a => [String(a._id), a.username]));
    await audit("CONSULTATION_READ", patient, auth, metadata);
    return {
        patient: { _id: patient._id, nom: patient.nom, prenom: patient.prenom },
        appointment, notes: notes.map(n => ({ ...n, author: authorNames.get(String(n.authorUserId)) || String(n.authorUserId) })),
        legacyNote: fullHistory ? patient.secure_request_profile?.clinicalNotes || "" : "",
        fullHistory, sharedNotesTruncated,
        canAddNote: appointment.status === "scheduled",
        canAcceptCare: !patient.ownerUserId,
        inCare,
    };
}

async function transaction(work) {
    const session = await mongoose.startSession();
    try {
        let result;
        await session.withTransaction(async () => { result = await work(session); }, { writeConcern: CLINICAL_WRITE_CONCERN });
        return result;
    } finally { await session.endSession(); }
}

export async function addConsultationNote(appointmentId, note, auth, metadata = {}) {
    if (typeof note !== "string" || !note.trim() || note.length > 20000) fail("INVALID_INPUT");
    return transaction(async (session) => {
        const { patient, appointment } = await access(appointmentId, auth, session);
        if (appointment.status !== "scheduled") fail("FORBIDDEN");
        await lockAuthorization(appointment, patient, auth, session);
        const [entry] = await PatientConsultationNote.create([{
            patientId: patient._id, appointmentId, authorUserId: auth.userId, note: note.trim(),
        }], { session });
        await audit("CONSULTATION_NOTE_CREATE", patient, auth, metadata, session);
        return { _id: entry._id };
    });
}

export async function acceptPatientCare(appointmentId, auth, metadata = {}) {
    return transaction(async (session) => {
        const { appointment, patient, inCare } = await access(appointmentId, auth, session);
        if (inCare) return { accepted: true };
        if (patient.ownerUserId) fail("CARE_ALREADY_ASSIGNED");
        await lockAuthorization(appointment, patient, auth, session);
        const updated = await Patient.updateOne({ _id: patient._id, archivedAt: null, ownerUserId: null },
            { $set: { ownerUserId: auth.userId } }, { session });
        if (updated.modifiedCount !== 1) fail("CARE_ALREADY_ASSIGNED");
        await audit("PATIENT_CARE_ACCEPT", patient, auth, metadata, session);
        return { accepted: true };
    });
}
