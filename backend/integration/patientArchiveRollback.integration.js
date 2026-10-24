// Run only with: bash scripts/run-urgentologist-walk-in-integration.sh --patient-archive
// Real MongoDB transactions and validators; authentication is a fixed test actor,
// not an authentication test. No persistence or transaction API is mocked.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import express from "express";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import patientsRouter from "../routes/patients.js";
import { Patient } from "../models/Patient.js";
import { PatientAuditLog } from "../models/PatientAuditLog.js";
import { WriteOperationAuditLog } from "../models/WriteOperationAuditLog.js";
import { PatientClinicalNoteVersion } from "../models/PatientClinicalNoteVersion.js";
import { PatientSecureRequestSnapshot } from "../models/PatientSecureRequestSnapshot.js";

const models = [Patient, PatientAuditLog, WriteOperationAuditLog, PatientClinicalNoteVersion, PatientSecureRequestSnapshot];
const operations = [
    { name: "archive", method: "DELETE", suffix: "", action: "PATIENT_ARCHIVE", archived: false },
    { name: "restore", method: "POST", suffix: "/restore", action: "PATIENT_RESTORE", archived: true },
];
const failures = [
    { name: "patient audit", model: PatientAuditLog, receipt: null },
    { name: "first receipt", model: WriteOperationAuditLog, receipt: "patientauditlogs" },
    { name: "final receipt", model: WriteOperationAuditLog, receipt: "patients" },
];
let uri, server, base, physician, ownsDatabase, events, pending;

// The independent reader has no transaction/session from the HTTP operation.
// Read the raw documents, including fields hidden by Mongoose projections.
async function snapshot() {
    const reader = new mongoose.mongo.MongoClient(uri, { readPreference: "primary", readConcern: { level: "majority" } });
    try {
        await reader.connect();
        const result = {};
        for (const model of models) {
            result[model.collection.name] = await reader.db().collection(model.collection.name).find({}).sort({ _id: 1 }).toArray();
        }
        return result;
    } finally { await reader.close(); }
}

beforeEach(async () => {
    ownsDatabase = false; server = undefined; events = []; pending = new Map();
    uri = process.env.CLINIA_WALKIN_TEST_URI || "";
    if (process.env.NODE_ENV !== "test" || !/^mongodb:\/\/127\.0\.0\.1:\d+\/clinia_walkin_integration\?directConnection=true&replicaSet=walkin_test$/.test(uri)) {
        throw new Error("Use the disposable local MongoDB test launcher.");
    }
    await mongoose.connect(uri, { autoCreate: false, autoIndex: false, monitorCommands: true, serverSelectionTimeoutMS: 10000 });
    expect((await mongoose.connection.db.admin().command({ hello: 1 })).setName).toBe("walkin_test");
    expect(await mongoose.connection.db.listCollections().toArray()).toHaveLength(0);
    ownsDatabase = true;
    for (const model of models) { await model.createCollection(); await model.createIndexes(); }

    // Retain only stage names and numeric server codes, never command payloads,
    // patient documents, free-text reasons, credentials or error messages.
    const client = mongoose.connection.getClient();
    client.on("commandStarted", event => {
        let stage;
        if (event.command.findAndModify === Patient.collection.name) stage = "patient update";
        if (event.command.insert === PatientAuditLog.collection.name) stage = "patient audit";
        if (event.command.insert === WriteOperationAuditLog.collection.name) {
            const collection = event.command.documents?.[0]?.collectionName;
            if (collection === "patientauditlogs") stage = "first receipt";
            if (collection === "patients") stage = "final receipt";
        }
        if (stage) pending.set(event.requestId, stage);
    });
    client.on("commandSucceeded", event => {
        const stage = pending.get(event.requestId);
        if (!stage) return;
        const code = event.reply?.writeErrors?.[0]?.code;
        events.push({ stage, ...(typeof code === "number" ? { code } : {}) });
        pending.delete(event.requestId);
    });
    client.on("commandFailed", event => {
        const stage = pending.get(event.requestId);
        if (stage) events.push({ stage, code: event.failure?.code });
        pending.delete(event.requestId);
    });

    physician = { userId: String(new mongoose.Types.ObjectId()), username: "synthetic-rollback-physician", role: "MEDECIN" };
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.auth = physician;
        req.requestContext = { requestId: randomUUID(), instanceId: "rollback-integration" };
        next();
    });
    app.use("/api/patients", patientsRouter);
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
    try {
        if (server) await new Promise(resolve => server.close(resolve));
    } finally {
        try {
            if (ownsDatabase) {
                expect(mongoose.connection.name).toBe("clinia_walkin_integration");
                await mongoose.connection.dropDatabase();
                expect(await mongoose.connection.db.listCollections().toArray()).toHaveLength(0);
            }
        } finally { await mongoose.disconnect(); }
    }
});

async function seedPatient(archived) {
    const patient = await Patient.create({
        nom: "SYNTHETIC_ROLLBACK", prenom: "TEST_ONLY", ownerUserId: physician.userId,
        secure_request_profile: { clinicalNotes: "Synthetic note retained verbatim." },
        archivedAt: archived ? new Date("2020-01-02T12:00:00Z") : null,
        archivedByUserId: archived ? physician.userId : null,
        archiveReason: archived ? "Synthetic original archive reason" : "",
        reactivationHistory: [{ reason: "Synthetic previous restoration", reactivatedAt: new Date("2020-01-01T12:00:00Z"), reactivatedByUserId: physician.userId, verificationId: "WRV-SYNTHETIC-PREVIOUS" }],
    });
    // Existing audit/receipt rows must survive both the failed attempt and retry.
    await PatientAuditLog.create({ action: "PATIENT_UPDATE", outcome: "SUCCESS", actorUserId: physician.userId, actorRole: "MEDECIN", patientId: patient._id });
    await WriteOperationAuditLog.create({ collectionName: "patients", operation: "UPDATE", outcome: "SUCCESS", patientId: String(patient._id), verificationId: "WRV-SYNTHETIC-BASELINE" });
    return patient;
}

async function mutate(operation, patientId, reason, clientMutationId) {
    const response = await fetch(`${base}/api/patients/${patientId}${operation.suffix}`, {
        method: operation.method,
        headers: { "Content-Type": "application/json", "x-client-mutation-id": clientMutationId },
        body: JSON.stringify({ reason }),
    });
    return { status: response.status, body: await response.json() };
}

async function rejectWrites(failure) {
    const info = (await mongoose.connection.db.listCollections({ name: failure.model.collection.name }).toArray())[0];
    const impossible = { rollbackFaultRequired: { $exists: true } };
    const validator = failure.receipt
        ? { $or: [{ collectionName: { $ne: failure.receipt } }, impossible] }
        : impossible;
    await mongoose.connection.db.command({ collMod: failure.model.collection.name, validator, validationLevel: "strict", validationAction: "error" });
    return () => mongoose.connection.db.command({ collMod: failure.model.collection.name,
        validator: info.options.validator || {}, validationLevel: info.options.validationLevel || "strict", validationAction: info.options.validationAction || "error" });
}

describe.each(operations)("MongoDB transactional patient $name", operation => {
    it.each(failures)("rolls back a server-rejected $name and commits once after removing the fault", async failure => {
        const patient = await seedPatient(operation.archived);
        const before = await snapshot();
        const beforePatient = before[Patient.collection.name][0];
        const reason = `Synthetic ${operation.name} rollback reason`;
        const clientMutationId = randomUUID();
        const restoreValidator = await rejectWrites(failure);
        events.length = 0;
        try {
            const failed = await mutate(operation, patient._id, reason, clientMutationId);
            expect(failed.status).toBe(500);
            expect(failed.body.error).toMatchObject({ code: "PERSISTENCE_FAILED", retryable: true });
            expect(failed.body.data).toBeUndefined();
            expect(failed.body.meta?.writeVerification).toBeUndefined();
            const stages = ["patient update", "patient audit", "first receipt", "final receipt"];
            const last = stages.indexOf(failure.name);
            // The server accepted all preceding transactional writes, then
            // rejected the intended insertion with DocumentValidationFailure.
            expect(events).toEqual(stages.slice(0, last + 1).map((stage, i) => ({ stage, ...(i === last ? { code: 121 } : {}) })));
            expect(await snapshot()).toEqual(before);
            expect(await WriteOperationAuditLog.countDocuments({ clientMutationId })).toBe(0);
        } finally { await restoreValidator(); }

        const success = await mutate(operation, patient._id, reason, clientMutationId);
        expect(success.status).toBe(200);
        expect(success.body.meta.writeVerification).toMatchObject({ status: "CONFIRMED", clientMutationId });
        const verificationId = success.body.meta.writeVerification.verificationId;
        expect(verificationId).toMatch(/^WRV-/);
        const after = await snapshot();
        expect(after[PatientAuditLog.collection.name]).toHaveLength(before[PatientAuditLog.collection.name].length + 1);
        expect(after[WriteOperationAuditLog.collection.name]).toHaveLength(before[WriteOperationAuditLog.collection.name].length + 2);
        expect(after[PatientAuditLog.collection.name]).toEqual(expect.arrayContaining(before[PatientAuditLog.collection.name]));
        expect(after[WriteOperationAuditLog.collection.name]).toEqual(expect.arrayContaining(before[WriteOperationAuditLog.collection.name]));
        expect(after[PatientClinicalNoteVersion.collection.name]).toEqual(before[PatientClinicalNoteVersion.collection.name]);
        expect(after[PatientSecureRequestSnapshot.collection.name]).toEqual(before[PatientSecureRequestSnapshot.collection.name]);
        const saved = after[Patient.collection.name][0];
        expect(saved.ownerUserId).toEqual(beforePatient.ownerUserId);
        expect(saved.secure_request_profile).toEqual(beforePatient.secure_request_profile);
        if (operation.archived) {
            expect(saved).toMatchObject({ archivedAt: null, archivedByUserId: null, archiveReason: "" });
            expect(saved.reactivationHistory).toHaveLength(beforePatient.reactivationHistory.length + 1);
            expect(saved.reactivationHistory.slice(0, -1)).toEqual(beforePatient.reactivationHistory);
            expect(saved.reactivationHistory.at(-1)).toMatchObject({ reason, reactivatedByUserId: new mongoose.Types.ObjectId(physician.userId), verificationId });
            expect(saved.reactivationHistory.at(-1).reactivatedAt).toBeInstanceOf(Date);
        } else {
            expect(saved.archivedAt).toBeInstanceOf(Date);
            expect(String(saved.archivedByUserId)).toBe(physician.userId);
            expect(saved.archiveReason).toBe(reason);
            expect(saved.reactivationHistory).toEqual(beforePatient.reactivationHistory);
        }
        expect(await PatientAuditLog.countDocuments({ action: operation.action, patientId: patient._id, outcome: "SUCCESS" })).toBe(1);
        const receipts = await WriteOperationAuditLog.find({ verificationId, clientMutationId }).lean();
        expect(receipts).toHaveLength(2);
        expect(receipts.map(r => r.collectionName).sort()).toEqual(["patientauditlogs", "patients"]);
        expect(receipts.every(r => r.outcome === "SUCCESS" && String(r.actorUserId) === physician.userId)).toBe(true);
        // Free-text reasons belong in the patient history, not the general logs.
        expect(JSON.stringify([...after[PatientAuditLog.collection.name], ...after[WriteOperationAuditLog.collection.name]])).not.toContain(reason);
    });
});
