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
    for (const [name, role, specialty] of [
        ["ips", "IPS", "IPS"], ["doctor", "MEDECIN", "Urgentologue"], ["other", "MEDECIN", "Medecin de famille"],
        ["secondFamily", "MEDECIN", "Médecine familiale"], ["reception", "RECEPTION", null],
    ]) {
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

describe("permanent transfer to a family physician", () => {
    const ask = (body = {}, sender = "ips") => request("/patients/" + patient._id + "/transfers", sender, {
        targetUserId: String(users.other._id), patientConsent: true, ...body,
    });
    const preference = (actor, acceptsNewPatients) => request("/transfer-preference", actor, { acceptsNewPatients });
    beforeEach(async () => {
        await AdminUser.updateOne({ _id: users.other._id }, { $set: { acceptsNewPatients: true } });
    });

    const path = (transfer, action) => "/transfers/" + transfer.data._id + "/" + action;
    const owner = async () => String((await Patient.findById(patient._id).lean()).ownerUserId);

    it("lets only a family physician change their personal explicit preference, including a legacy account", async () => {
        await AdminUser.collection.updateOne({ _id: users.other._id }, { $unset: { acceptsNewPatients: "" } });
        const capabilities = () => request("/transfer-capabilities", "other");
        expect((await capabilities()).data).toEqual({ canInitiate: false, acceptsNewPatients: false });
        for (const actor of ["ips", "doctor", "reception"]) {
            expect((await preference(actor, true)).status).toBe(403);
        }
        expect((await request("/transfer-preference", "other", { acceptsNewPatients: true, targetUserId: String(users.doctor._id) })).status).toBe(400);
        expect((await preference("other", "true")).status).toBe(400);
        expect((await capabilities()).data.acceptsNewPatients).toBe(false);
        expect((await request("/patients/" + patient._id + "/transfer-context", "ips")).data.clinicians).toEqual([]);
        expect((await preference("other", true)).status).toBe(200);
        expect((await capabilities()).data.acceptsNewPatients).toBe(true);
        await Specialist.updateOne({ accountUserId: users.doctor._id }, { $set: { specialite: "Medecin de famille" } });
        expect((await request("/transfer-capabilities", "doctor")).data.acceptsNewPatients).toBe(false);
        const directory = await request("/patients/" + patient._id + "/transfer-context", "ips");
        expect(directory.data.clinicians.map(user => user._id)).toEqual([String(users.other._id)]);
    });

    it.each(["ips", "doctor"])("rechecks the family physician opt-in at submission and preserves earlier requests (%s)", async sender => {
        await Patient.updateOne({ _id: patient._id }, { $set: { ownerUserId: users[sender]._id } });
        const directory = () => request("/patients/" + patient._id + "/transfer-context", sender);
        expect((await directory()).data.clinicians.map(user => user._id)).toEqual([String(users.other._id)]);
        expect((await preference("other", false)).status).toBe(200);
        expect((await directory()).data.clinicians).toEqual([]);
        const staleSelection = await ask({}, sender);
        expect(staleSelection.status).toBe(409);
        expect(staleSelection.error.code).toBe("TRANSFER_RECIPIENT_UNAVAILABLE");
        expect(await PatientCareTransfer.countDocuments()).toBe(0);
        expect(await owner()).toBe(String(users[sender]._id));
        expect((await preference("other", true)).status).toBe(200);
        const transfer = await ask({}, sender);
        expect(transfer.status).toBe(201);
        expect((await preference("other", false)).status).toBe(200);
        expect((await directory()).data.clinicians).toEqual([]);
        expect((await request("/transfers", "other")).data.map(item => item._id)).toEqual([transfer.data._id]);
        expect((await request(path(transfer, "record"), "other")).status).toBe(200);
        expect((await request(path(transfer, "decision"), "other", { decision: "accept" })).status).toBe(200);
        expect(await owner()).toBe(String(users.other._id));
    });

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

    it("lets an urgentologist transfer only their own patient, with consent, to the selected family physician", async () => {
        const context = "/patients/" + patient._id + "/transfer-context";
        const patientPath = "/api/patients/" + patient._id;
        const urgentologistId = String(users.doctor._id);
        const familyId = String(users.other._id);

        expect((await request("/transfer-capabilities", "ips")).data).toEqual({ canInitiate: true, acceptsNewPatients: null });
        expect((await request("/transfer-capabilities", "doctor")).data).toEqual({ canInitiate: true, acceptsNewPatients: null });
        expect((await request("/transfer-capabilities", "other")).data).toEqual({ canInitiate: false, acceptsNewPatients: true });
        expect((await request("/transfer-capabilities", "reception")).status).toBe(403);

        // Ownership and specialty are independent requirements for the sender.
        expect((await request(context, "doctor")).status).toBe(403);
        expect((await ask({}, "doctor")).status).toBe(403);
        await Patient.updateOne({ _id: patient._id }, { $set: { ownerUserId: users.doctor._id } });
        await Specialist.updateOne({ accountUserId: users.doctor._id }, { $set: { specialite: "Cardiologue" } });
        expect((await request(context, "doctor")).status).toBe(403);
        expect((await ask({}, "doctor")).status).toBe(403);
        await Specialist.updateOne({ accountUserId: users.doctor._id }, { $set: { specialite: "Urgentologue" } });

        const directory = await request(context, "doctor");
        expect(directory.status).toBe(200);
        expect(directory.data.clinicians.map(user => user._id)).toEqual([familyId]);
        expect((await ask({ patientConsent: false }, "doctor")).error.code).toBe("TRANSFER_CONSENT_REQUIRED");
        expect((await ask({ targetUserId: urgentologistId }, "doctor")).status).toBe(403);
        expect((await request("/patients/" + patient._id + "/grants", "doctor")).status).toBe(403);
        expect(await PatientCareTransfer.countDocuments()).toBe(0);

        const transfer = await ask({}, "doctor");
        expect(transfer.status).toBe(201);
        expect(transfer.data).toMatchObject({ status: "PENDING", consentRecordedAt: expect.any(String) });
        expect(await owner()).toBe(urgentologistId);
        for (const account of ["doctor", "other"]) {
            expect((await request("/transfers", account)).data.map(item => item._id)).toEqual([transfer.data._id]);
        }
        expect((await request(path(transfer, "decision"), "doctor", { decision: "accept" })).status).toBe(403);
        expect((await request(path(transfer, "cancel"), "ips", {})).status).toBe(403);
        expect((await request(path(transfer, "record"), "other")).data.profile.clinicalNotes).toBe("Original unchanged synthetic note");
        expect((await request(patientPath, "other", { prenom: "Too early" }, "PATCH")).status).toBe(404);
        const accepted = await request(path(transfer, "decision"), "other", { decision: "accept" });
        expect(accepted.status).toBe(200);
        expect(accepted.data.status).toBe("ACCEPTED");
        expect(await owner()).toBe(familyId);
        expect((await request(patientPath, "doctor", { prenom: "Former owner" }, "PATCH")).status).toBe(404);
        expect((await request(patientPath, "other", { prenom: "New holder" }, "PATCH")).status).toBe(200);
        expect((await Patient.findById(patient._id).lean()).prenom).toBe("New holder");
        expect((await request("/transfers", "doctor")).data[0]).toMatchObject({ status: "ACCEPTED", patient: null });
        expect(await WriteOperationAuditLog.countDocuments({
            collectionName: "patientcaretransfers", resourceId: transfer.data._id, operation: "CREATE",
            actorUserId: users.doctor._id, actorRole: "MEDECIN",
        })).toBe(1);
    });

    it("continues to authorize pending IPS transfers recorded before issuer roles were stored", async () => {
        const transfer = await ask();
        const transferId = new mongoose.Types.ObjectId(transfer.data._id);
        await PatientCareTransfer.collection.updateOne({ _id: transferId }, { $unset: { issuerRole: "" } });
        expect((await request("/transfers", "ips")).data.map(item => item._id)).toEqual([transfer.data._id]);
        expect((await request(path(transfer, "record"), "other")).status).toBe(200);
        expect((await request(path(transfer, "decision"), "other", { decision: "accept" })).status).toBe(200);
        expect(await owner()).toBe(String(users.other._id));
    });

    it("withdraws temporary access when the issuing urgentologist no longer has the qualifying specialty", async () => {
        await Patient.updateOne({ _id: patient._id }, { $set: { ownerUserId: users.doctor._id } });
        const transfer = await ask({}, "doctor");
        expect(transfer.status).toBe(201);
        await Specialist.updateOne({ accountUserId: users.doctor._id }, { $set: { specialite: "Cardiologue" } });
        expect((await request("/transfers", "other")).data).toEqual([]);
        expect((await request(path(transfer, "record"), "other")).status).toBe(403);
        expect((await request(path(transfer, "decision"), "other", { decision: "accept" })).status).toBe(403);
        expect(await owner()).toBe(String(users.doctor._id));
    });

    it.each(["ips", "doctor"])("stops the preview after decline, cancellation or expiry and retains the holder (%s)", async sender => {
        await Patient.updateOne({ _id: patient._id }, { $set: { ownerUserId: users[sender]._id } });
        const refused = await ask({}, sender);
        expect((await request(path(refused, "decision"), "other", { decision: "decline" })).data.status).toBe("DECLINED");
        expect((await request(path(refused, "record"), "other")).status).toBe(403);
        const withdrawn = await ask({}, sender);
        expect((await request(path(withdrawn, "cancel"), sender, {})).data.status).toBe("CANCELLED");
        expect((await request(path(withdrawn, "record"), "other")).status).toBe(403);
        const expired = await ask({}, sender);
        await PatientCareTransfer.collection.updateOne({ _id: new mongoose.Types.ObjectId(expired.data._id) }, { $set: { expiresAt: new Date(Date.now() - 60000) } });
        expect((await request(path(expired, "record"), "other")).status).toBe(403);
        expect((await request(path(expired, "decision"), "other", { decision: "accept" })).status).toBe(403);
        expect((await request("/transfers", "other")).data).toEqual([]);
        expect((await ask({}, sender)).status).toBe(201);
        expect((await PatientCareTransfer.findById(expired.data._id).lean()).status).toBe("EXPIRED");
        expect(await owner()).toBe(String(users[sender]._id));
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

describe("anonymous general calls for a family physician", () => {
    const general = (actor, body = { patientConsent: true }) =>
        request("/patients/" + patient._id + "/general-transfer", actor, body);
    const accept = (id, actor) => request("/transfers/" + id + "/decision", actor, { decision: "accept" });
    const reminder = actor => request("/transfer-reminder", actor);
    const setPreference = acceptsNewPatients => request("/transfer-preference", "other", { acceptsNewPatients });
    const direct = () => request("/patients/" + patient._id + "/transfers", "ips", {
        targetUserId: String(users.other._id), patientConsent: true,
    });
    const owner = async () => String((await Patient.findById(patient._id).lean()).ownerUserId);

    it.each(["ips", "doctor"])("requires consent from the owning %s and an empty direct directory", async issuer => {
        await Patient.updateOne({ _id: patient._id }, { $set: { ownerUserId: users[issuer]._id } });
        const nonOwner = issuer === "ips" ? "doctor" : "ips";
        expect((await general(nonOwner)).status).toBe(403);
        expect((await general("reception")).status).toBe(403);
        expect((await general("other")).status).toBe(403);
        expect((await general(issuer, { patientConsent: false })).error.code).toBe("TRANSFER_CONSENT_REQUIRED");
        expect((await general(issuer, { patientConsent: true, targetUserId: String(users.other._id) })).status).toBe(400);
        expect((await setPreference(true)).status).toBe(200);
        expect(await general(issuer)).toMatchObject({ status: 409, error: { code: "TRANSFER_RECIPIENT_AVAILABLE" } });
        expect(await PatientCareTransfer.countDocuments()).toBe(0);
        expect((await setPreference(false)).status).toBe(200);
        const call = await general(issuer);
        expect(call.status).toBe(201);
        expect(call.data).toMatchObject({ kind: "GENERAL", status: "PENDING", consentRecordedAt: expect.any(String) });
        expect(await general(issuer)).toMatchObject({ status: 409, error: { code: "TRANSFER_ALREADY_PENDING" } });
        expect(await PatientCareTransfer.countDocuments()).toBe(1);
        for (const candidate of ["other", "secondFamily"]) {
            const list = await request("/transfers", candidate);
            expect(list.status).toBe(200);
            expect(list.data).toHaveLength(1);
            const [invitation] = list.data;
            expect(invitation).toMatchObject({ _id: call.data._id, patient: null, patientId: null, targetUserId: null, professional: "" });
            const payload = JSON.stringify(list.data);
            for (const sensitive of [String(patient._id), patient.nom, patient.prenom, patient.num_assurance_maladie, patient.telephone,
                patient.courriel, String(users[issuer]._id), users[issuer].username, "Original unchanged synthetic note", "PRIVATE_STORAGE_KEY"]) {
                expect(payload).not.toContain(sensitive);
            }
            expect((await reminder(candidate)).data.incomingGeneral).toBe(true);
            expect((await request("/transfers/" + call.data._id + "/record", candidate)).status).toBe(403);
            expect((await request("/transfers/" + call.data._id + "/decision", candidate, { decision: "decline" })).status).toBe(403);
            expect((await request("/api/patients/" + patient._id, candidate)).status).toBe(404);
        }
        expect((await request("/transfers", nonOwner)).data).toEqual([]);
        expect((await reminder(nonOwner)).data.incomingGeneral).toBe(false);
        expect((await accept(call.data._id, nonOwner)).status).toBe(403);
        expect(await owner()).toBe(String(users[issuer]._id));
    });

    it("allows exactly one of two general-call volunteers to acquire the record, even if neither accepts direct requests", async () => {
        const call = await general("ips");
        expect(call.status).toBe(201);
        // An overdue reminder does not close the invitation.
        await PatientCareTransfer.collection.updateOne({ _id: new mongoose.Types.ObjectId(call.data._id) }, {
            $set: { createdAt: new Date(Date.now() - 49 * 60 * 60 * 1000) },
        });
        const candidates = ["other", "secondFamily"];
        const attempts = await Promise.all(candidates.map(actor => accept(call.data._id, actor)));
        expect(attempts.map(reply => reply.status).sort()).toEqual([200, 403]);
        const winnerIndex = attempts.findIndex(reply => reply.status === 200);
        const winner = candidates[winnerIndex], loser = candidates[1 - winnerIndex];
        expect(attempts[winnerIndex].data).toMatchObject({
            status: "ACCEPTED", targetUserId: String(users[winner]._id), patientId: String(patient._id),
        });
        expect(await owner()).toBe(String(users[winner]._id));
        expect((await request("/api/patients/" + patient._id, winner, { prenom: "New general holder" }, "PATCH")).status).toBe(200);
        expect((await request("/api/patients/" + patient._id, loser)).status).toBe(404);
        expect((await request("/transfers/" + call.data._id + "/record", loser)).status).toBe(403);
        expect((await request("/transfers", loser)).data).toEqual([]);
        expect((await reminder(loser)).data.incomingGeneral).toBe(false);
        expect((await request("/api/patients/" + patient._id, "ips")).status).toBe(404);
        expect(await PatientAuditLog.countDocuments({ patientId: patient._id, action: "PATIENT_CARE_ACCEPT" })).toBe(1);
    });

    it("shares one pending transfer slot between direct and general requests", async () => {
        expect((await setPreference(true)).status).toBe(200);
        const first = await direct();
        expect(first.status).toBe(201);
        expect((await setPreference(false)).status).toBe(200);
        expect(await general("ips")).toMatchObject({ status: 409, error: { code: "TRANSFER_ALREADY_PENDING" } });
        expect((await request("/transfers/" + first.data._id + "/cancel", "ips", {})).status).toBe(200);
        const second = await general("ips");
        expect(second.status).toBe(201);
        expect((await setPreference(true)).status).toBe(200);
        expect(await direct()).toMatchObject({ status: 409, error: { code: "TRANSFER_ALREADY_PENDING" } });
        expect(await PatientCareTransfer.countDocuments({ status: "PENDING" })).toBe(1);
    });

    it("returns all open general invitations even after more than 100 calls and 100 more recent decisions", async () => {
        const start = new Date(Date.now() - 49 * 60 * 60 * 1000);
        const openPatients = Array.from({ length: 101 }, (_, i) => ({
            _id: new mongoose.Types.ObjectId(), ownerUserId: users.ips._id, nom: "Synthetic", prenom: "Fixture " + i,
        }));
        await Patient.collection.insertMany(openPatients);
        const invitations = openPatients.map(record => ({
            _id: new mongoose.Types.ObjectId(), kind: "GENERAL", patientId: record._id, issuerUserId: users.ips._id,
            issuerRole: "IPS", status: "PENDING", createdAt: start, consentRecordedAt: start,
        }));
        await PatientCareTransfer.collection.insertMany(invitations);
        const now = new Date();
        await PatientCareTransfer.collection.insertMany(Array.from({ length: 101 }, () => ({
            kind: "GENERAL", patientId: patient._id, issuerUserId: users.ips._id, issuerRole: "IPS",
            status: "CANCELLED", createdAt: now, consentRecordedAt: now, resolvedAt: now,
        })));
        const ids = invitations.map(item => String(item._id)).sort();
        const candidate = await request("/transfers", "other");
        expect(candidate.data.map(item => item._id).sort()).toEqual(ids);
        expect(candidate.data.every(item => item.patient === null && item.patientId === null)).toBe(true);
        const issuer = await request("/transfers", "ips");
        expect(issuer.data.filter(item => item.status === "PENDING").map(item => item._id).sort()).toEqual(ids);
        expect((await reminder("ips")).data.overdueCount).toBe(101);
    });

    it("reminds the current issuer after 48 hours, keeps the call open and clears the reminder on cancellation", async () => {
        const call = await general("ips");
        expect(call.status).toBe(201);
        const id = call.data._id;
        const before = await reminder("ips");
        expect(before.data.overdueCount).toBe(0);
        const elapsed = Date.parse(before.data.nextReminderAt) - Date.parse(call.data.createdAt);
        expect(elapsed).toBe(48 * 60 * 60 * 1000);
        await PatientCareTransfer.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, {
            $set: { createdAt: new Date(Date.now() - 49 * 60 * 60 * 1000) },
        });
        expect((await reminder("ips")).data.overdueCount).toBe(1);
        expect((await request("/transfers", "ips")).data[0]).toMatchObject({ status: "PENDING", reminderDue: true });
        expect((await reminder("other")).data.overdueCount).toBe(0);
        expect((await request("/transfers", "other")).data[0]).toMatchObject({ status: "PENDING", patientId: null });
        await Patient.updateOne({ _id: patient._id }, { $set: { ownerUserId: users.doctor._id } });
        expect((await reminder("ips")).data.overdueCount).toBe(0);
        expect((await request("/transfers", "other")).data).toEqual([]);
        expect((await reminder("other")).data.incomingGeneral).toBe(false);
        expect((await accept(id, "other")).status).toBe(403);
        await Patient.updateOne({ _id: patient._id }, { $set: { ownerUserId: users.ips._id } });
        expect((await request("/transfers/" + id + "/cancel", "doctor", {})).status).toBe(403);
        expect((await request("/transfers/" + id + "/cancel", "ips", {})).data.status).toBe("CANCELLED");
        expect((await reminder("ips")).data).toMatchObject({ overdueCount: 0, nextReminderAt: null });
        expect((await accept(id, "other")).status).toBe(403);
        expect(await owner()).toBe(String(users.ips._id));
    });
});
