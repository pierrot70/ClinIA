// Real JWT validation, HTTP, MongoDB transactions/indexes and server validators.
// Only the standard disposable local replica-set launcher is accepted.
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import express from "express";
import jwt from "jsonwebtoken";
import router from "../routes/clinicalCareAccess.js";
import patientsRouter from "../routes/patients.js";
import { verifyJWT } from "../middleware/verifyJWT.js";
import { requireRole } from "../middleware/requireRole.js";
import { loi25DataLeakGuard } from "../middleware/loi25DataLeakGuard.js";
import { AdminUser } from "../models/AdminUser.js";
import { Specialist } from "../models/Specialist.js";
import { Patient } from "../models/Patient.js";
import { PatientCareTransfer } from "../models/PatientCareTransfer.js";
import { Appointment } from "../models/Appointment.js";
import { PatientConsultationNote } from "../models/PatientConsultationNote.js";
import { ClinicalCareAccessGrant } from "../models/ClinicalCareAccessGrant.js";
import { PatientSharedConsultationNote } from "../models/PatientSharedConsultationNote.js";
import { PatientAuditLog } from "../models/PatientAuditLog.js";
import { WriteOperationAuditLog } from "../models/WriteOperationAuditLog.js";

let uri, server, base, tokens, users, patient, ownsDatabase;
const tracked = [AdminUser, Specialist, Patient, PatientCareTransfer, ClinicalCareAccessGrant, PatientSharedConsultationNote, PatientAuditLog, WriteOperationAuditLog];
async function snapshot() {
    const reader = new mongoose.mongo.MongoClient(uri, { readPreference: "primary", readConcern: { level: "majority" } });
    try { await reader.connect(); const value = {}; for (const model of tracked) value[model.collection.name] = await reader.db().collection(model.collection.name).find({}).sort({ _id: 1 }).toArray(); return value; }
    finally { await reader.close(); }
}
async function request(path, actor = "doctor", body, method = body === undefined ? "GET" : "POST") {
    const endpoint = path.startsWith("/api/") ? new URL(path, base) : base + path;
    const result = await fetch(endpoint, { method, headers: { ...(tokens[actor] ? { Authorization: `Bearer ${tokens[actor]}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: result.status, cacheControl: result.headers.get("cache-control"), ...await result.json() };
}
async function createGrant() {
    const created = await request(`/patients/${patient._id}/grants`, "ips", { targetUserId: String(users.doctor._id), durationMinutes: 60 });
    expect(created.status).toBe(201);
    expect(created.meta.writeVerification).toMatchObject({ status: "CONFIRMED", verificationId: expect.stringMatching(/^WRV-/) });
    return created.data._id;
}
beforeEach(async () => {
    ownsDatabase = false; server = undefined;
    uri = process.env.CLINIA_WALKIN_TEST_URI || "";
    if (process.env.NODE_ENV !== "test" || !/^mongodb:\/\/127\.0\.0\.1:\d+\/clinia_walkin_integration\?directConnection=true&replicaSet=walkin_test$/.test(uri)) throw new Error("Use the disposable local test launcher.");
    vi.stubEnv("JWT_ACCESS_SECRET", randomBytes(48).toString("hex"));
    await mongoose.connect(uri, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 10000 });
    expect((await mongoose.connection.db.admin().command({ hello: 1 })).setName).toBe("walkin_test");
    expect(await mongoose.connection.db.listCollections().toArray()).toHaveLength(0); ownsDatabase = true;
    for (const model of Object.values(mongoose.models)) { await model.createCollection(); await model.createIndexes(); }
    users = {}; tokens = {};
    for (const [name, role, specialty] of [["ips", "IPS", "IPS"], ["doctor", "MEDECIN", "Urgentologue"], ["other", "MEDECIN", "Medecin de famille"], ["reception", "RECEPTION", null]]) {
        const sid = randomUUID();
        const user = await AdminUser.create({ username: `synthetic_care_${name}`, email: `synthetic-care-${name}@example.invalid`, role, isActive: true,
            passwordHash: "SYNTHETIC_NOT_A_LOGIN_PASSWORD", authVersion: 0, activeSessionIds: [sid], sessionStartedAt: new Date(), lastActivityAt: new Date() });
        users[name] = user;
        if (specialty) await Specialist.create({ nom: "Synthetic", prenom: name, numero_medecin: `SYNTHETIC_CARE_${name}`, specialite: specialty, accountUserId: user._id });
        tokens[name] = jwt.sign({ sub: String(user._id), role, sid, av: 0 }, process.env.JWT_ACCESS_SECRET, { algorithm: "HS256", issuer: "clinia-backend", audience: "clinia-app", expiresIn: "15m" });
    }
    patient = await Patient.create({ nom: "SYNTHETIC_CARE_PATIENT", prenom: "TEST_ONLY", ownerUserId: users.ips._id,
        num_assurance_maladie: "SYNTHETIC_NOT_EXPORTED", telephone: "NOT_EXPORTED", courriel: "not-exported@example.invalid",
        secure_request_profile: { clinicalNotes: "Original unchanged synthetic note", selected_document_ids: ["PRIVATE_STORAGE_KEY"] } });
    await PatientConsultationNote.create({ patientId: patient._id, appointmentId: new mongoose.Types.ObjectId(), authorUserId: users.ips._id, note: "Synthetic original consultation entry" });
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.requestContext = { requestId: randomUUID(), instanceId: "synthetic-care-integration" }; next(); });
    app.use("/api/clinical-care-access", verifyJWT, requireRole("IPS", "MEDECIN"), loi25DataLeakGuard, router);
    app.use("/api/patients", verifyJWT, requireRole("IPS", "MEDECIN"), loi25DataLeakGuard, patientsRouter);
    server = app.listen(0, "127.0.0.1"); await once(server, "listening"); base = `http://127.0.0.1:${server.address().port}/api/clinical-care-access`;
});
afterEach(async () => {
    try { if (server) await new Promise(resolve => server.close(resolve)); }
    finally { try { if (ownsDatabase) { expect(mongoose.connection.name).toBe("clinia_walkin_integration"); await mongoose.connection.dropDatabase(); expect(await mongoose.connection.db.listCollections().toArray()).toHaveLength(0); } }
        finally { await mongoose.disconnect(); vi.unstubAllEnvs(); } }
});

describe("dedicated, revocable IPS care sharing on a real disposable replica set", () => {
    it("audits a retained expired invitation before creating its replacement", async () => {
        const previousId = await createGrant();
        await ClinicalCareAccessGrant.collection.updateOne({ _id: new mongoose.Types.ObjectId(previousId) }, { $set: { expiresAt: new Date(Date.now() - 60000) } });
        const replacementId = await createGrant();
        expect(replacementId).not.toBe(previousId);
        expect((await ClinicalCareAccessGrant.findById(previousId).lean()).status).toBe("EXPIRED");
        const receipts = await WriteOperationAuditLog.find({ collectionName: "clinicalcareaccessgrants", resourceId: previousId }).lean();
        expect(receipts.map(event => event.operation).sort()).toEqual(["CREATE", "UPDATE"]);
        expect(receipts.find(event => event.operation === "UPDATE")).toMatchObject({ actorRole: "IPS", changedFields: ["status"] });
        expect((await request(`/grants/${previousId}/record`)).status).toBe(403);
        expect((await request(`/grants/${replacementId}/record`)).status).toBe(200);
    });
    it("preserves the IPS identity/ownership while allowing only the selected physician to read and append", async () => {
        expect((await request("/eligible-clinicians", "reception")).status).toBe(403);
        expect((await request("/eligible-clinicians", "anonymous")).status).toBe(401);
        const eligible = await request("/eligible-clinicians", "ips"); expect(eligible.status).toBe(200);
        expect(eligible.data.map(a => a._id)).toContain(String(users.doctor._id));
        const grantId = await createGrant();
        expect((await request(`/grants/${grantId}/record`, "other")).status).toBe(403);
        const record = await request(`/grants/${grantId}/record`);
        expect(record.status).toBe(200); expect(record.cacheControl).toBe("no-store");
        expect(record.data.profile.clinicalNotes).toBe("Original unchanged synthetic note");
        expect(record.data.originalNotes[0]).toMatchObject({ note: "Synthetic original consultation entry", authorRole: null });
        expect(JSON.stringify(record.data)).not.toMatch(/SYNTHETIC_NOT_EXPORTED|NOT_EXPORTED|PRIVATE_STORAGE_KEY/);
        const appended = await request(`/grants/${grantId}/notes`, "doctor", { note: "Synthetic shared consultation note" });
        expect(appended.status).toBe(201); expect(appended.meta.writeVerification.status).toBe("CONFIRMED");
        const saved = await PatientSharedConsultationNote.findById(appended.data._id).lean();
        expect(saved).toMatchObject({ authorRole: "MEDECIN", authorSpecialty: "Urgentologue", note: "Synthetic shared consultation note" });
        expect(String(saved.authorUserId)).toBe(String(users.doctor._id));
        const ownerView = await request(`/patients/${patient._id}/notes`, "ips");
        expect(ownerView.status).toBe(200); expect(ownerView.data.sharedNotes[0].note).toBe(saved.note);
        expect((await request(`/grants/${grantId}/revoke`, "ips", {})).status).toBe(200);
        expect((await request(`/grants/${grantId}/record`)).status).toBe(403);
        expect((await request(`/grants/${grantId}/notes`, "doctor", { note: "Must not persist" })).status).toBe(403);
        expect(await PatientSharedConsultationNote.countDocuments()).toBe(1);
        const retained = await Patient.findById(patient._id).lean();
        expect(String(retained.ownerUserId)).toBe(String(users.ips._id)); expect(retained.secure_request_profile.clinicalNotes).toBe("Original unchanged synthetic note");
        const audits = await WriteOperationAuditLog.find({}).lean();
        expect(audits.some(a => a.collectionName === "clinicalcareaccessgrants" && a.actorRole === "IPS" && a.operation === "CREATE")).toBe(true);
        expect(audits.some(a => a.collectionName === "patientsharedconsultationnotes" && a.actorRole === "MEDECIN" && a.operation === "CREATE")).toBe(true);
        expect(JSON.stringify(audits)).not.toContain("Synthetic shared consultation note");
    });

    it("revalidates expiry, current ownership and account activation instead of trusting an old invitation", async () => {
        const grantId = await createGrant();
        await ClinicalCareAccessGrant.updateOne({ _id: grantId }, { $set: { status: "REVOKED" } });
        expect((await request(`/grants/${grantId}/record`)).status).toBe(403);
        await ClinicalCareAccessGrant.collection.updateOne({ _id: new mongoose.Types.ObjectId(grantId) }, { $set: { status: "ACTIVE", expiresAt: new Date(Date.now() - 1000) } });
        expect((await request(`/grants/${grantId}/notes`, "doctor", { note: "Expired forbidden" })).status).toBe(403);
        await ClinicalCareAccessGrant.collection.updateOne({ _id: new mongoose.Types.ObjectId(grantId) }, { $set: { expiresAt: new Date(Date.now() + 3600000) } });
        await Patient.updateOne({ _id: patient._id }, { $set: { ownerUserId: users.other._id } });
        expect((await request(`/grants/${grantId}/record`)).status).toBe(403);
        expect((await request("/grants")).data).toEqual([]);
        await Patient.updateOne({ _id: patient._id }, { $set: { ownerUserId: users.ips._id } });
        await AdminUser.updateOne({ _id: users.ips._id }, { $set: { isActive: false } });
        expect((await request(`/grants/${grantId}/record`)).status).toBe(403);
        expect(await PatientSharedConsultationNote.countDocuments()).toBe(0);
    });

    it("rolls back the new note, locks and audit rows when the real receipt insert is rejected by MongoDB", async () => {
        const grantId = await createGrant(); const before = await snapshot();
        await mongoose.connection.db.command({ collMod: WriteOperationAuditLog.collection.name, validator: { $expr: { $ne: ["$collectionName", "patientsharedconsultationnotes"] } }, validationAction: "error", validationLevel: "strict" });
        const denied = await request(`/grants/${grantId}/notes`, "doctor", { note: "Synthetic rejected note" });
        expect(denied.status).toBe(500); expect(denied.error.code).toBe("PERSISTENCE_FAILED");
        expect(JSON.stringify(denied)).not.toContain("Synthetic rejected note");
        expect(await snapshot()).toEqual(before);
        await mongoose.connection.db.command({ collMod: WriteOperationAuditLog.collection.name, validator: {} });
        expect((await request(`/grants/${grantId}/notes`, "doctor", { note: "Synthetic retry succeeds" })).status).toBe(201);
        expect(await PatientSharedConsultationNote.countDocuments()).toBe(1);
    });

    it("serializes revoke versus append and never accepts a later note after revocation", async () => {
        const grantId = await createGrant();
        const [note, revoke] = await Promise.all([request(`/grants/${grantId}/notes`, "doctor", { note: "Synthetic racing note" }), request(`/grants/${grantId}/revoke`, "ips", {})]);
        expect(revoke.status).toBe(200); expect([201, 403]).toContain(note.status);
        const savedGrant = await ClinicalCareAccessGrant.findById(grantId).lean(); expect(savedGrant.status).toBe("REVOKED");
        const notes = await PatientSharedConsultationNote.find({}).lean(); expect(notes).toHaveLength(note.status === 201 ? 1 : 0);
        if (notes.length) expect(notes[0].createdAt.getTime()).toBeLessThanOrEqual(savedGrant.revokedAt.getTime());
        expect((await request(`/grants/${grantId}/notes`, "doctor", { note: "Synthetic later forbidden" })).status).toBe(403);
        expect(await PatientSharedConsultationNote.countDocuments()).toBe(notes.length);
    });
});

describe("permanent transfer from IPS to a family physician", () => {
    const ask = (body = {}, sender = "ips") => request("/patients/" + patient._id + "/transfers", sender, {
        targetUserId: String(users.other._id), patientConsent: true, ...body,
    });
    const path = (transfer, action) => "/transfers/" + transfer.data._id + "/" + action;
    const owner = async () => String((await Patient.findById(patient._id).lean()).ownerUserId);

    it("records consent, permits only the designated doctor to review, and grants the ordinary patient rights on acceptance", async () => {
        const context = "/patients/" + patient._id + "/transfer-context";
        expect((await request(context, "reception")).status).toBe(403);
        expect((await request(context, "other")).status).toBe(403);
        expect((await request(context, "ips")).data.clinicians.map(user => user._id)).toEqual([String(users.other._id)]);
        expect((await ask({ patientConsent: false })).error.code).toBe("TRANSFER_CONSENT_REQUIRED");
        expect((await ask({ targetUserId: String(users.doctor._id) })).status).toBe(403);
        expect((await ask({}, "doctor")).status).toBe(403);
        expect(await PatientCareTransfer.countDocuments()).toBe(0);

        const note = await PatientConsultationNote.findOne({ patientId: patient._id }).lean();
        const appointment = await Appointment.create({
            _id: note.appointmentId, patient: patient._id, specialist: (await Specialist.findOne({ accountUserId: users.ips._id }))._id,
            ownerUserId: users.ips._id, date: "2030-01-03", time: "11:00",
        });
        const oldGrant = await createGrant();
        const transfer = await ask();
        expect(transfer.status).toBe(201);
        expect(transfer.meta.writeVerification.status).toBe("CONFIRMED");
        expect(transfer.data).toMatchObject({ patientId: String(patient._id), status: "PENDING", consentRecordedAt: expect.any(String) });
        expect(await owner()).toBe(String(users.ips._id));
        expect((await ask()).error.code).toBe("TRANSFER_ALREADY_PENDING");
        expect((await request("/transfers", "doctor")).data).toEqual([]);
        expect((await request("/transfers", "other")).data).toHaveLength(1);
        expect((await request(path(transfer, "record"), "doctor")).status).toBe(403);
        expect((await request(path(transfer, "decision"), "doctor", { decision: "accept" })).status).toBe(403);
        const preview = await request(path(transfer, "record"), "other");
        expect(preview.status).toBe(200);
        expect(preview.cacheControl).toBe("no-store");
        expect(preview.data.originalNotes).toHaveLength(1);
        expect(preview.data.originalNotes[0].authorUserId).toBe(String(users.ips._id));
        expect(JSON.stringify(preview.data)).not.toMatch(/SYNTHETIC_NOT_EXPORTED|NOT_EXPORTED|PRIVATE_STORAGE_KEY/);
        expect((await request("/grants/" + transfer.data._id + "/notes", "other", { note: "Must not persist" })).status).toBe(403);
        const patientPath = "/api/patients/" + patient._id;
        expect((await request(patientPath, "other")).status).toBe(404);
        expect((await request(patientPath, "other", { prenom: "Attempted change" }, "PATCH")).status).toBe(404);
        expect((await request(patientPath, "ips")).status).toBe(200);

        const accepted = await request(path(transfer, "decision"), "other", { decision: "accept" });
        expect(accepted.status).toBe(200);
        expect(accepted.data).toMatchObject({ patientId: String(patient._id), status: "ACCEPTED" });
        expect(await owner()).toBe(String(users.other._id));
        expect(await PatientConsultationNote.findById(note._id).lean()).toEqual(note);
        expect((await Appointment.findById(appointment._id).lean()).patient).toEqual(patient._id);
        expect((await request("/grants/" + oldGrant + "/record", "doctor")).status).toBe(403);
        expect((await request(patientPath, "ips")).status).toBe(404);
        expect((await request(patientPath, "other")).status).toBe(200);
        expect((await request(patientPath, "other", { prenom: "Updated by new holder" }, "PATCH")).status).toBe(200);
        expect((await Patient.findById(patient._id).lean()).prenom).toBe("Updated by new holder");
        expect((await request(path(transfer, "record"), "other")).data.transfer.status).toBe("ACCEPTED");
        expect((await request("/transfers", "ips")).data[0]).toMatchObject({ status: "ACCEPTED", patient: null });
        expect(await WriteOperationAuditLog.countDocuments({ collectionName: "patientcaretransfers", resourceId: transfer.data._id })).toBe(2);
        expect(await PatientAuditLog.countDocuments({ patientId: patient._id, action: "PATIENT_CARE_ACCEPT", actorUserId: users.other._id })).toBe(1);
    });

    it("stops the preview after decline, cancellation or expiry and retains the IPS as holder", async () => {
        const refused = await ask();
        expect((await request(path(refused, "decision"), "other", { decision: "decline" })).data.status).toBe("DECLINED");
        expect((await request(path(refused, "record"), "other")).status).toBe(403);
        const withdrawn = await ask();
        expect((await request(path(withdrawn, "cancel"), "ips", {})).data.status).toBe("CANCELLED");
        expect((await request(path(withdrawn, "record"), "other")).status).toBe(403);
        const expired = await ask();
        await PatientCareTransfer.collection.updateOne({ _id: new mongoose.Types.ObjectId(expired.data._id) }, { $set: { expiresAt: new Date(Date.now() - 60000) } });
        expect((await request(path(expired, "record"), "other")).status).toBe(403);
        expect((await request(path(expired, "decision"), "other", { decision: "accept" })).status).toBe(403);
        expect((await request("/transfers", "other")).data).toEqual([]);
        expect((await ask()).status).toBe(201);
        expect((await PatientCareTransfer.findById(expired.data._id).lean()).status).toBe("EXPIRED");
        expect(await owner()).toBe(String(users.ips._id));
    });

    it("preserves both records if the receiving physician already has an identifier in conflict", async () => {
        await Patient.create({
            nom: "SYNTHETIC_CONFLICT", prenom: "TEST", ownerUserId: users.other._id,
            country: patient.country, healthInsuranceJurisdiction: patient.healthInsuranceJurisdiction,
            num_assurance_maladie: patient.num_assurance_maladie,
        });
        const transfer = await ask();
        const result = await request(path(transfer, "decision"), "other", { decision: "accept" });
        expect(result.status).toBe(409);
        expect(result.error.code).toBe("TRANSFER_PATIENT_CONFLICT");
        expect(await owner()).toBe(String(users.ips._id));
        expect(await Patient.countDocuments()).toBe(2);
        expect((await PatientCareTransfer.findById(transfer.data._id).lean()).status).toBe("PENDING");
    });

    it("serializes acceptance and cancellation and fails closed if the transfer audit cannot be stored", async () => {
        const transfer = await ask();
        const collection = PatientAuditLog.collection.name;
        const db = mongoose.connection.db;
        await db.command({ collMod: collection, validator: { action: { $ne: "PATIENT_CARE_ACCEPT" } }, validationLevel: "strict" });
        try {
            expect((await request(path(transfer, "decision"), "other", { decision: "accept" })).status).toBe(500);
            expect(await owner()).toBe(String(users.ips._id));
            expect((await PatientCareTransfer.findById(transfer.data._id).lean()).status).toBe("PENDING");
        } finally {
            await db.command({ collMod: collection, validator: {} });
        }
        const results = await Promise.all([
            request(path(transfer, "decision"), "other", { decision: "accept" }),
            request(path(transfer, "cancel"), "ips", {}),
        ]);
        expect(results.map(reply => reply.status).sort()).toEqual([200, 403]);
        const persisted = await PatientCareTransfer.findById(transfer.data._id).lean();
        expect(["ACCEPTED", "CANCELLED"]).toContain(persisted.status);
        expect(await owner()).toBe(String(persisted.status === "ACCEPTED" ? users.other._id : users.ips._id));
    });
});
