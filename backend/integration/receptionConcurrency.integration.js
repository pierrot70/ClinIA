import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import express from "express";
import { once } from "node:events";
import authRouter from "../routes/auth.js";
import receptionRouter from "../routes/reception.js";
import appointmentsRouter from "../routes/appointments.js";
import { verifyJWT } from "../middleware/verifyJWT.js";
import { requireRole } from "../middleware/requireRole.js";
import { loi25DataLeakGuard } from "../middleware/loi25DataLeakGuard.js";
import { AdminUser } from "../models/AdminUser.js";
import { Clinique } from "../models/Clinique.js";
import { Specialist } from "../models/Specialist.js";
import { Patient } from "../models/Patient.js";
import { Appointment } from "../models/Appointment.js";
import { AppointmentBookingGuard } from "../models/AppointmentBookingGuard.js";
import { PatientAuditLog } from "../models/PatientAuditLog.js";
import { WriteOperationAuditLog } from "../models/WriteOperationAuditLog.js";
import { ReceptionBookingProof } from "../models/ReceptionBookingProof.js";
import { CLINICAL_WRITE_CONCERN } from "../db/clinicalWriteConcern.js";
import { getReplicaSetStatus } from "../services/dbStatus.js";
import { readConsultation, addConsultationNote } from "../services/consultations.js";
import { PatientConsultationNote } from "../models/PatientConsultationNote.js";

const day = "2099-01-15";
const times = Array.from({ length: 24 }, (_, i) => `${String(8 + Math.floor(i / 4)).padStart(2, "0")}:${String(i % 4 * 15).padStart(2, "0")}`);
let server, base, clinic, otherClinic, doctors, receptionUsers, physicianUsers, tokens, physicianTokens;
let ownsDatabase = false;
let gates;
let mongoWriteErrorCodes;

async function request(path, { token, body, method = body ? "POST" : "GET", gate } = {}) {
    const response = await fetch(`${base}${path}`, {
        method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body ? { "Content-Type": "application/json" } : {}), ...(gate ? { "x-test-race": gate } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, ...await response.json() };
}
const patient = n => ({ nom: `SyntheticLast${n}`, prenom: `SyntheticFirst${n}`, num_assurance_maladie: `TEST${String(n).padStart(8, "0")}`, country: "CA", healthInsuranceJurisdiction: "QC", language: "fr" });
const payload = (n, specialist = doctors[0], time = times[0]) => ({ clinic, specialist, date: day, time, slotType: "walk_in", patient: patient(n) });
async function lookupProof(patientId, actor = 0) {
    const record = await Patient.findById(patientId);
    const lookup = await request(`/api/reception/patient-lookup?clinic=${clinic}&ramq=${record.num_assurance_maladie}`, { token: tokens[actor] });
    expect(lookup.status).toBe(200);
    return lookup.data.bookingProof;
}
async function book(body, actor = 0, gate) {
    if (body.patientId && body.bookingProof === undefined) body = { ...body, bookingProof: await lookupProof(body.patientId, actor) };
    return request("/api/reception/walk-in-bookings", { token: tokens[actor], body, gate });
}
async function race(left, right) {
    const key = randomUUID();
    const results = await Promise.all([left(key), right(key)]);
    expect(gates.get(key).arrivals).toBe(2);
    return results;
}
async function counts() {
    return { patients: await Patient.countDocuments(), appointments: await Appointment.countDocuments(),
        guards: await AppointmentBookingGuard.countDocuments(), patientAudits: await PatientAuditLog.countDocuments(),
        writeAudits: await WriteOperationAuditLog.countDocuments() };
}
function recordedReplicaSummary(snapshot) {
    // A direct ephemeral-port connection can be reported alongside the
    // replica's advertised hostname by the existing collector. Test that the
    // receipt preserves the actual observed summary, never an invented count.
    return Object.fromEntries(["status", "memberCount", "healthyCount", "primaryCount", "secondaryCount",
        "majorityAvailable", "maxLagSeconds", "laggingThresholdSeconds"].map(key => [key, snapshot.summary[key]]));
}
async function seedKnownPatient(n = 1) {
    const response = await book(payload(n));
    expect(response.status).toBe(201);
    const appointment = await Appointment.findOne({});
    const completed = await request(`/api/appointments/${appointment._id}/status`, {
        token: physicianTokens[0], method: "PATCH", body: { status: "completed" },
    });
    expect(completed.status).toBe(200);
    return String(appointment.patient);
}

beforeEach(async () => {
    ownsDatabase = false; server = undefined; gates = new Map(); mongoWriteErrorCodes = [];
    const uri = process.env.CLINIA_WALKIN_TEST_URI || "";
    if (process.env.NODE_ENV !== "test" || !/^mongodb:\/\/127\.0\.0\.1:\d+\/clinia_walkin_integration\?directConnection=true&replicaSet=walkin_test$/.test(uri)) throw new Error("Use the disposable local MongoDB test launcher.");
    vi.stubEnv("JWT_ACCESS_SECRET", randomBytes(48).toString("hex"));
    vi.stubEnv("JWT_REFRESH_SECRET", randomBytes(48).toString("hex"));
    await mongoose.connect(uri, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 10000, monitorCommands: true });
    // Retain numeric error codes only, never commands, documents or error text.
    mongoose.connection.getClient().on("commandSucceeded", event => {
        for (const error of event.reply?.writeErrors || []) mongoWriteErrorCodes.push(error.code);
    });
    expect((await mongoose.connection.db.admin().command({ hello: 1 })).setName).toBe("walkin_test");
    expect(await mongoose.connection.db.listCollections().toArray()).toHaveLength(0);
    ownsDatabase = true;
    for (const model of Object.values(mongoose.models)) { await model.createCollection(); await model.createIndexes(); }
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${day}T07:00:00-05:00`));
    const password = randomBytes(32).toString("hex");
    const passwordHash = await bcrypt.hash(password, 10);
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const locations = await Clinique.create([1, 2].map(n => ({ nom: `TestClinic${n}`, num_civique: "1", rue: "Synthetic Street", code_postal: "H0H0H0" })), { session, ordered: true });
            clinic = String(locations[0]._id); otherClinic = String(locations[1]._id);
            receptionUsers = []; physicianUsers = []; doctors = [];
            for (let i = 0; i < 4; i++) {
                const role = i < 2 ? "RECEPTION" : "MEDECIN";
                const [user] = await AdminUser.create([{ username: `test_${role.toLowerCase()}_${i}`, email: `test_${i}@example.invalid`,
                    passwordHash, role, isActive: true, assignedClinics: i < 2 ? [clinic] : [],
                }], { session });
                if (i < 2) receptionUsers.push(user); else {
                    physicianUsers.push(user);
                    const [doctor] = await Specialist.create([{ nom: `TestDoctor${i}`, prenom: "Synthetic", numero_medecin: `TEST${i}`, specialite: "Urgentologue",
                        accountUserId: user._id, clinique_associer: clinic,
                        practiceLocations: [{ clinique: clinic, disponibilites: [], walkInDisponibilites: times.map(time => new Date(`${day}T${time}:00-05:00`)) }],
                    }], { session });
                    doctors.push(String(doctor._id));
                }
            }
        }, { writeConcern: CLINICAL_WRITE_CONCERN });
    } finally { await session.endSession(); }
    const app = express();
    app.use(express.json());
    app.use("/api/auth", authRouter);
    // Test-only barrier, after actual authentication. No service/model is mocked.
    app.use(verifyJWT, (req, res, next) => {
        const key = req.headers["x-test-race"];
        if (!key) return next();
        let entry = gates.get(key);
        if (!entry) {
            entry = { arrivals: 0, callbacks: [], timer: setTimeout(() => {
                for (const pending of entry.callbacks) pending.fail();
                entry.callbacks = [];
            }, 5000) };
            gates.set(key, entry);
        }
        entry.arrivals++;
        entry.callbacks.push({ next, fail: () => res.status(500).json({ error: { code: "TEST_BARRIER_TIMEOUT" } }) });
        if (entry.arrivals === 2) { clearTimeout(entry.timer); for (const pending of entry.callbacks) pending.next(); entry.callbacks = []; }
    });
    app.use("/api/reception", requireRole("RECEPTION"), loi25DataLeakGuard, receptionRouter);
    app.use("/api/appointments", requireRole("MEDECIN"), loi25DataLeakGuard, appointmentsRouter);
    server = app.listen(0, "127.0.0.1"); await once(server, "listening"); base = `http://127.0.0.1:${server.address().port}`;
    const authenticated = [];
    for (const user of [...receptionUsers, ...physicianUsers]) {
        const result = await request("/api/auth/login", { body: { username: user.username, password } });
        expect(result.status).toBe(200); expect(typeof result.data.accessToken).toBe("string");
        authenticated.push(result.data.accessToken);
    }
    tokens = authenticated.slice(0, 2); physicianTokens = authenticated.slice(2);
    expect(tokens[0]).not.toBe(tokens[1]);
});

afterEach(async () => {
    try {
        for (const entry of gates.values()) clearTimeout(entry.timer);
        if (server) await new Promise(resolve => server.close(resolve));
    } finally {
        try {
            if (ownsDatabase) {
                expect(mongoose.connection.name).toBe("clinia_walkin_integration");
                await mongoose.connection.dropDatabase();
                expect(await mongoose.connection.db.listCollections().toArray()).toHaveLength(0);
            }
        } finally { await mongoose.disconnect(); vi.useRealTimers(); vi.unstubAllEnvs(); }
    }
});

describe("1. Same slot, two authenticated reception accounts", () => {
    it("accepts exactly one booking without leaving a losing patient's dossier", async () => {
        const results = await race(gate => book(payload(1), 0, gate), gate => book(payload(2), 1, gate));
        expect(results.map(result => result.status).sort()).toEqual([201, 409]);
        expect(["NO_AVAILABILITY", "SPECIALIST_ALREADY_BOOKED"]).toContain(results.find(result => result.status === 409).error.code);
        expect(await counts()).toMatchObject({ patients: 1, appointments: 1, guards: 1, patientAudits: 1, writeAudits: 1 });
        const audit = await WriteOperationAuditLog.findOne({ operation: "CREATE" });
        expect(String(audit.actorUserId)).toBe(String(receptionUsers[results.findIndex(result => result.status === 201)]._id));
    });
});

describe("2. Same patient, different slots", () => {
    it("serializes known-patient bookings even across different physicians", async () => {
        const patientId = await seedKnownPatient();
        const body = { clinic, patientId, date: day, slotType: "walk_in" };
        const bookingProof = await lookupProof(patientId);
        const valid = { ...body, specialist: doctors[0], time: times[1], bookingProof };
        // The known-patient scenario also verifies the mandatory lookup boundary.
        for (const [payload, actor] of [[{ ...valid, bookingProof: null }, 0], [valid, 1], [{ ...valid, patientId: String(new mongoose.Types.ObjectId()) }, 0]]) {
            const denied = await book(payload, actor);
            expect(denied.status).toBe(403);
            expect(denied.error.code).toBe("RECEPTION_LOOKUP_REQUIRED");
        }
        const proofRecord = await ReceptionBookingProof.findOne({});
        for (const change of [{ expiresAt: new Date(Date.now() - 1) }, { sessionId: "other-session" }, { clinicId: otherClinic }]) {
            await ReceptionBookingProof.updateOne({ _id: proofRecord._id }, { $set: change });
            const denied = await book(valid);
            expect(denied.status).toBe(403);
            expect(denied.error.code).toBe("RECEPTION_LOOKUP_REQUIRED");
            await ReceptionBookingProof.updateOne({ _id: proofRecord._id }, { $set: { expiresAt: proofRecord.expiresAt, sessionId: proofRecord.sessionId, clinicId: proofRecord.clinicId } });
        }
        expect(await Appointment.countDocuments({ status: "scheduled" })).toBe(0);
        const results = await race(
            gate => book({ ...body, specialist: doctors[0], time: times[1] }, 0, gate),
            gate => book({ ...body, specialist: doctors[1], time: times[2] }, 1, gate),
        );
        expect(results.map(result => result.status).sort()).toEqual([201, 409]);
        expect(results.find(result => result.status === 409).error.code).toBe("RECEPTION_REPLAN_REQUIRED");
        expect(await Patient.countDocuments()).toBe(1);
        expect(await Appointment.countDocuments({ patient: patientId, clinique: clinic, status: "scheduled" })).toBe(1);
        expect(await Appointment.countDocuments({ patient: patientId, status: "completed" })).toBe(1);
        const scheduled = await Appointment.findOne({ patient: patientId, status: "scheduled" });
        // Race the exact same proof for replacement; only one transaction may commit.
        const sameProof = await lookupProof(patientId);
        const replacement = { ...body, specialist: doctors[0], bookingProof: sameProof, replaceAppointmentId: String(scheduled._id) };
        const proofRace = await race(gate => book({ ...replacement, time: times[3] }, 0, gate), gate => book({ ...replacement, time: times[4] }, 0, gate));
        expect(proofRace.map(result => result.status).sort()).toEqual([201, 403]);
        expect(proofRace.find(result => result.status === 403).error.code).toBe("RECEPTION_LOOKUP_REQUIRED");
        const replay = await book({ ...replacement, time: times[5] });
        expect(replay.status).toBe(403);
        expect(replay.error.code).toBe("RECEPTION_LOOKUP_REQUIRED");
        expect(await Appointment.countDocuments({ patient: patientId, status: "scheduled" })).toBe(1);
    });
    it("rejects duplicate simultaneous creation of the same new patient with a controlled conflict", async () => {
        const results = await race(
            gate => book(payload(1, doctors[0], times[0]), 0, gate),
            gate => book(payload(1, doctors[1], times[1]), 1, gate),
        );
        expect(await Patient.countDocuments()).toBe(1);
        expect(await Appointment.countDocuments({ clinique: clinic, status: "scheduled" })).toBe(1);
        expect(mongoWriteErrorCodes).toContain(11000);
        expect(results.map(result => result.status).sort()).toEqual([201, 409]);
        expect(results.find(result => result.status === 409).error.code).toBe("PATIENT_ALREADY_EXISTS");
    });
});

describe("3. Last daily consultation", () => {
    it("never exceeds twenty with distinct patients, slots, accounts and active sessions", async () => {
        for (let n = 1; n <= 19; n++) expect((await book(payload(n, doctors[0], times[n - 1]), n % 2)).status).toBe(201);
        const results = await race(
            gate => book(payload(20, doctors[0], times[19]), 0, gate),
            gate => book(payload(21, doctors[0], times[20]), 1, gate),
        );
        expect(results.map(result => result.status).sort()).toEqual([201, 409]);
        expect(results.find(result => result.status === 409).error.code).toBe("MAXIMUM_APPOINTMENTS_REACHED");
        expect(await Appointment.countDocuments({ specialist: doctors[0], date: day, status: { $in: ["scheduled", "completed"] } })).toBe(20);
        expect(await counts()).toMatchObject({ patients: 20, appointments: 20, guards: 20, patientAudits: 20, writeAudits: 20 });
    });
});

describe("4. Booking, cancellation and rescheduling conflicts", () => {
    it("keeps a slot unique while a physician cancellation races a new reception booking", async () => {
        expect((await book(payload(1), 0)).status).toBe(201);
        const original = await Appointment.findOne({});
        const [cancel, booking] = await race(
            gate => request(`/api/appointments/${original._id}/status`, { token: physicianTokens[0], method: "PATCH", body: { status: "cancelled", cancellationReason: "patient" }, gate }),
            gate => book(payload(2), 1, gate),
        );
        expect(cancel.status).toBe(200);
        expect([201, 409]).toContain(booking.status);
        if (booking.status === 409) expect(["NO_AVAILABILITY", "SPECIALIST_ALREADY_BOOKED"]).toContain(booking.error.code);
        expect((await Appointment.findById(original._id)).status).toBe("cancelled");
        expect(await Appointment.countDocuments({ status: "scheduled" })).toBe(booking.status === 201 ? 1 : 0);
        expect(await Patient.countDocuments()).toBe(booking.status === 201 ? 2 : 1);
    });
    it("allows only one replacement when both reception accounts replan the original", async () => {
        const originalResponse = await book(payload(1));
        expect(originalResponse.status).toBe(201);
        expect(originalResponse.meta.writeVerification.status).toBe("CONFIRMED");
        const original = await Appointment.findOne({});
        const body = { clinic, patientId: String(original.patient), specialist: doctors[0], date: day, replaceAppointmentId: String(original._id), slotType: "walk_in" };
        const observedSnapshot = await getReplicaSetStatus();
        expect(observedSnapshot.available).toBe(true);
        const results = await race(gate => book({ ...body, time: times[1] }, 0, gate), gate => book({ ...body, time: times[2] }, 1, gate));
        expect(results.map(result => result.status).sort()).toEqual([201, 409]);
        expect(results.find(result => result.status === 409).error.code).toBe("RECEPTION_REPLAN_REQUIRED");
        const old = await Appointment.findById(original._id);
        const active = await Appointment.findOne({ patient: original.patient, status: "scheduled" });
        expect(old.status).toBe("rescheduled");
        expect(String(old.rescheduledTo)).toBe(String(active._id));
        expect(String(active.rescheduledFrom)).toBe(String(old._id));
        expect(await Appointment.countDocuments()).toBe(2);
        expect(await Patient.countDocuments()).toBe(1);
        expect((await AppointmentBookingGuard.findOne({ patient: original.patient })).scheduledCount).toBe(1);
        const winner = results.find(result => result.status === 201);
        const loser = results.find(result => result.status === 409);
        expect(loser.meta?.writeVerification).toBeUndefined();
        expect(winner.meta.writeVerification.status).toBe("CONFIRMED");
        const wrv = winner.meta.writeVerification.verificationId;
        expect(wrv).toMatch(/^WRV-[A-Z0-9]+-[A-F0-9]{12}$/);
        expect(wrv).not.toBe(originalResponse.meta.writeVerification.verificationId);
        const verified = await WriteOperationAuditLog.find({ verificationId: wrv }).lean();
        expect(verified).toHaveLength(2);
        expect(verified.map(event => event.operation).sort()).toEqual(["CREATE", "UPDATE"]);
        expect(new Set(verified.map(event => event.resourceId))).toEqual(new Set([String(old._id), String(active._id)]));
        const winnerActor = String(receptionUsers[results.findIndex(result => result.status === 201)]._id);
        verified.forEach(event => {
            expect(String(event.actorUserId)).toBe(winnerActor);
            expect(event.writeConcern).toMatchObject(CLINICAL_WRITE_CONCERN);
            expect(event.replicaSet).toMatchObject(recordedReplicaSummary(observedSnapshot));
        });
    });
    it("keeps a consistent history when reception replan races physician cancellation", async () => {
        expect((await book(payload(1))).status).toBe(201);
        const original = await Appointment.findOne({});
        const [replan, cancel] = await race(
            gate => book({ clinic, patientId: String(original.patient), specialist: doctors[0], date: day, time: times[1], replaceAppointmentId: String(original._id), slotType: "walk_in" }, 1, gate),
            gate => request(`/api/appointments/${original._id}/status`, { token: physicianTokens[0], method: "PATCH", body: { status: "cancelled", cancellationReason: "patient" }, gate }),
        );
        const old = await Appointment.findById(original._id);
        if (replan.status === 201) {
            expect([400, 409]).toContain(cancel.status);
            expect(cancel.error.code).toBe("STATUS_IMMUTABLE");
            expect(old.status).toBe("rescheduled");
            expect(await Appointment.countDocuments({ patient: original.patient, status: "scheduled" })).toBe(1);
            expect(String((await Appointment.findById(old.rescheduledTo)).rescheduledFrom)).toBe(String(original._id));
        } else {
            expect(replan.status).toBe(409);
            expect(replan.error.code).toBe("RECEPTION_REPLAN_REQUIRED");
            expect(cancel.status).toBe(200);
            expect(old.status).toBe("cancelled");
            expect(await Appointment.countDocuments()).toBe(1);
            expect(old.rescheduledTo).toBeUndefined();
        }
        expect(await Patient.countDocuments()).toBe(1);
    });
    it("does not double-book a slot being released by another reception's replan", async () => {
        expect((await book(payload(1))).status).toBe(201);
        const original = await Appointment.findOne({});
        const [replan, booking] = await race(
            gate => book({ clinic, patientId: String(original.patient), specialist: doctors[0], date: day, time: times[1], replaceAppointmentId: String(original._id), slotType: "walk_in" }, 0, gate),
            gate => book(payload(2), 1, gate),
        );
        expect(replan.status).toBe(201);
        expect([201, 409]).toContain(booking.status);
        if (booking.status === 409) expect(["NO_AVAILABILITY", "SPECIALIST_ALREADY_BOOKED"]).toContain(booking.error.code);
        expect((await Appointment.findById(original._id)).status).toBe("rescheduled");
        const active = await Appointment.find({ status: "scheduled" }).lean();
        expect(new Set(active.map(item => `${item.specialist}-${item.date}-${item.time}`)).size).toBe(active.length);
        expect(await Patient.countDocuments()).toBe(booking.status === 201 ? 2 : 1);
    });
});

describe("5. API authorization", () => {
    it.each([0, 1])("denies foreign-clinic reads and writes for reception account %s", async actor => {
        const before = await counts();
        for (const path of [`/walk-in-options?clinic=${otherClinic}`, `/patient-lookup?clinic=${otherClinic}&ramq=${patient(1).num_assurance_maladie}`]) {
            const response = await request(`/api/reception${path}`, { token: tokens[actor] });
            expect(response.status).toBe(403); expect(response.data).toBeUndefined();
        }
        const forged = await book({ ...payload(1), clinic: otherClinic, authUser: { role: "SUPERADMIN" }, ownerUserId: String(physicianUsers[0]._id) }, actor);
        expect(forged.status).toBe(403);
        expect(await counts()).toEqual(before);
    });
    it("rejects missing/invalid JWT and a physician token on the reception API", async () => {
        for (const token of [undefined, "invalid.jwt.value", physicianTokens[0]]) {
            const response = await request("/api/reception/walk-in-bookings", { token, body: payload(1) });
            expect(response.status).toBe(token === physicianTokens[0] ? 403 : 401);
        }
        expect(await Patient.countDocuments()).toBe(0);
    });
    it.each([0, 1])("rejects a previously authenticated reception after deactivation (%s)", async actor => {
        await AdminUser.updateOne({ _id: receptionUsers[actor]._id }, { $set: { isActive: false } });
        const result = await book(payload(1), actor);
        expect(result.status).toBe(401); expect(result.error.code).toBe("ACCOUNT_INACTIVE");
        expect(await Patient.countDocuments()).toBe(0);
    });
    it.each(["inactive", "wrong-role", "unlinked"])("rejects and hides a receiving physician who becomes %s after availability lookup", async state => {
        const available = await request(`/api/reception/walk-in-options?clinic=${clinic}`, { token: tokens[0] });
        expect(available.data.today.some(item => item.specialist._id === doctors[0])).toBe(true);
        if (state === "unlinked") await Specialist.updateOne({ _id: doctors[0] }, { $unset: { accountUserId: 1 } });
        else await AdminUser.updateOne({ _id: physicianUsers[0]._id }, { $set: state === "inactive" ? { isActive: false } : { role: "USER" } });
        for (let actor = 0; actor < 2; actor++) {
            const refused = await book(payload(actor + 1), actor);
            expect(refused.status).toBe(409); expect(refused.error.code).toBe("RECEIVING_PHYSICIAN_UNAVAILABLE");
            const refreshed = await request(`/api/reception/walk-in-options?clinic=${clinic}`, { token: tokens[actor] });
            expect(refreshed.data.today.some(item => item.specialist._id === doctors[0])).toBe(false);
        }
        expect(await counts()).toMatchObject({ patients: 0, appointments: 0, guards: 0, patientAudits: 0, writeAudits: 0 });
    });
});

describe("6. Atomic failure and minimized clinical audit records", () => {
    it("rolls back dossier, appointment and guard if the final audit insert fails", async () => {
        const before = await counts();
        // Real database fault after clinical writes: the audit collection rejects
        // inserts until its validator is restored. No production hook or mock.
        const collection = WriteOperationAuditLog.collection.collectionName;
        await mongoose.connection.db.command({ collMod: collection, validator: { $jsonSchema: { required: ["__test_required_field"] } }, validationLevel: "strict" });
        try {
            for (let actor = 0; actor < 2; actor++) {
                const response = await book(payload(actor + 1), actor);
                expect(response.status).toBe(500); expect(response.error.code).toBe("PERSISTENCE_FAILED");
                expect(response.error.stack).toBeUndefined();
                expect(response.meta?.writeVerification).toBeUndefined();
                expect(await counts()).toEqual(before);
            }
        } finally { await mongoose.connection.db.command({ collMod: collection, validator: {} }); }
        const observedSnapshot = await getReplicaSetStatus();
        expect(observedSnapshot.available).toBe(true);
        const success = await book(payload(1));
        expect(success.status).toBe(201);
        expect(success.meta.writeVerification.status).toBe("CONFIRMED");
        expect(success.data.writeAuditRecorded).toBeUndefined();
        expect(await counts()).toMatchObject({ patients: 1, appointments: 1, guards: 1, patientAudits: 1, writeAudits: 1 });
        const receipt = await WriteOperationAuditLog.findOne({ verificationId: success.meta.writeVerification.verificationId }).lean();
        expect(receipt).toMatchObject({ collectionName: "appointments", operation: "CREATE", resourceId: String(success.data.appointment._id), outcome: "SUCCESS" });
        expect(String(receipt.actorUserId)).toBe(String(receptionUsers[0]._id));
        expect(receipt.writeConcern).toMatchObject(CLINICAL_WRITE_CONCERN);
        expect(receipt.replicaSet).toMatchObject(recordedReplicaSummary(observedSnapshot));
    });
    it("rolls back replacement links, capacity and booking proof when the CREATE receipt fails after the UPDATE receipt", async () => {
        const initial = await book(payload(1));
        expect(initial.status).toBe(201);
        const original = await Appointment.findOne({});
        const bookingProof = await lookupProof(String(original.patient));
        const body = { clinic, patientId: String(original.patient), specialist: doctors[0], date: day,
            time: times[1], replaceAppointmentId: String(original._id), slotType: "walk_in", bookingProof };
        const before = await counts();
        const ownerBefore = String((await Patient.findById(original.patient)).ownerUserId);
        const collection = WriteOperationAuditLog.collection.collectionName;
        // The old-appointment UPDATE audit can be inserted, but the later
        // new-appointment CREATE audit fails inside the same real transaction.
        await mongoose.connection.db.command({ collMod: collection,
            validator: { $jsonSchema: { properties: { operation: { enum: ["UPDATE"] } } } }, validationLevel: "strict" });
        try {
            const refused = await book(body);
            expect(refused.status).toBe(500);
            expect(refused.error.code).toBe("PERSISTENCE_FAILED");
            expect(refused.meta?.writeVerification).toBeUndefined();
            expect(await counts()).toEqual(before);
            const unchanged = await Appointment.findById(original._id);
            expect(unchanged.status).toBe("scheduled");
            expect(unchanged.rescheduledTo).toBeUndefined();
            expect((await AppointmentBookingGuard.findOne({ patient: original.patient })).scheduledCount).toBe(1);
            expect(String((await Patient.findById(original.patient)).ownerUserId)).toBe(ownerBefore);
        } finally {
            await mongoose.connection.db.command({ collMod: collection, validator: {} });
        }
        // Reusing this exact one-time proof succeeds only if its failed
        // transaction consumption was rolled back as well.
        const success = await book(body);
        expect(success.status).toBe(201);
        expect(success.meta.writeVerification.status).toBe("CONFIRMED");
        const audits = await WriteOperationAuditLog.find({ verificationId: success.meta.writeVerification.verificationId }).lean();
        expect(audits.map(event => event.operation).sort()).toEqual(["CREATE", "UPDATE"]);
        expect(await Appointment.countDocuments({ patient: original.patient, status: "scheduled" })).toBe(1);
        expect(await Patient.countDocuments()).toBe(1);
    });
    it("keeps both reception actors attributable without patient names, insurance numbers, contacts or clinical text in audits", async () => {
        const forbiddenValues = [];
        for (let actor = 0; actor < 2; actor++) {
            const dto = payload(actor + 1, doctors[actor], times[actor]);
            Object.assign(dto.patient, { telephone: `514555000${actor}`, email: `patient${actor}@example.invalid`, notes: "SYNTHETIC_CONFIDENTIAL_NOTE" });
            forbiddenValues.push(dto.patient.nom, dto.patient.prenom, dto.patient.num_assurance_maladie, dto.patient.telephone, dto.patient.email, dto.patient.notes);
            expect((await book(dto, actor)).status).toBe(201);
            expect((await request(`/api/reception/patient-lookup?clinic=${clinic}&ramq=${dto.patient.num_assurance_maladie}`, { token: tokens[actor] })).status).toBe(200);
        }
        const audits = [...await PatientAuditLog.find({}).lean(), ...await WriteOperationAuditLog.find({}).lean()];
        expect(audits.length).toBeGreaterThanOrEqual(6);
        const serialized = JSON.stringify(audits);
        for (const value of forbiddenValues) expect(serialized.includes(value)).toBe(false);
        for (const actor of receptionUsers) expect(audits.some(event => String(event.actorUserId) === String(actor._id))).toBe(true);
        for (const event of audits) {
            expect(event.actorRole).toBe("RECEPTION"); expect(event.ip).toBeTruthy();
            expect(event.timestamp || event.createdAt).toBeTruthy();
            expect(event.action || event.operation).toBeTruthy();
            expect(event.requestPath).not.toContain("?");
        }
        // Internal patient/resource IDs deliberately remain for traceability;
        // this is minimization, not an assertion of anonymous audit records.
        expect(audits.some(event => event.patientId)).toBe(true);
    });
});


describe("7. Past scheduled records do not block a new reception arrival", () => {
    it("keeps two historical scheduled appointments intact, rejects their replacement IDs and books a genuinely receipted new arrival", async () => {
        const patientId = await seedKnownPatient();
        const template = await Appointment.findOne({ patient: patientId }).lean();
        const historical = [];
        // Explicit synthetic history fixtures, not a migration or status repair.
        for (const date of ["2099-01-13", "2099-01-14"]) {
            const { _id, __v, createdAt, updatedAt, ...fields } = template;
            const record = await Appointment.create({ ...fields, date, status: "scheduled" });
            historical.push(record.toObject());
            await AppointmentBookingGuard.create({ patient: patientId, specialist: doctors[0], date, scheduledCount: 1 });
        }
        const lookup = await request(`/api/reception/patient-lookup?clinic=${clinic}&ramq=${patient(1).num_assurance_maladie}`, { token: tokens[0] });
        expect(lookup.status).toBe(200);
        expect(lookup.data.existingAppointments).toEqual([]);
        expect(lookup.data.hasHistoricalScheduledAppointments).toBe(true);
        expect(Object.keys(lookup.data).sort()).toEqual(["_id", "bookingProof", "existingAppointments", "hasHistoricalScheduledAppointments", "nom", "prenom"].sort());
        const optionsPath = `/api/reception/walk-in-options?clinic=${clinic}&patient=${patientId}`;
        const options = await request(optionsPath, { token: tokens[0] });
        expect(options.status).toBe(200);
        expect(options.data.today.some(item => item.specialist._id === doctors[0] && item.slots.includes(times[1]))).toBe(true);
        // Exact per-day quota: two scheduled old days cannot inflate today.
        expect(await Appointment.countDocuments({ specialist: doctors[0], date: day, status: { $in: ["scheduled", "completed"] } })).toBe(1);
        const body = { clinic, patientId, specialist: doctors[0], date: day, time: times[1], slotType: "walk_in", bookingProof: lookup.data.bookingProof };
        const before = await counts();
        for (const original of historical) {
            const staleOptions = await request(`${optionsPath}&replaceAppointmentId=${original._id}`, { token: tokens[0] });
            expect(staleOptions.status).toBe(409);
            expect(staleOptions.error.code).toBe("RECEPTION_REPLAN_REQUIRED");
            const refused = await book({ ...body, replaceAppointmentId: String(original._id) });
            expect(refused.status).toBe(409);
            expect(refused.error.code).toBe("RECEPTION_REPLAN_REQUIRED");
            expect(refused.meta?.writeVerification).toBeUndefined();
        }
        expect(await counts()).toEqual(before);
        // The exact proof survives both rejected transactions; no new lookup.
        const booked = await book(body);
        expect(booked.status).toBe(201);
        expect(booked.meta.writeVerification.status).toBe("CONFIRMED");
        const receipts = await WriteOperationAuditLog.find({ verificationId: booked.meta.writeVerification.verificationId }).lean();
        expect(receipts).toHaveLength(1);
        expect(receipts[0]).toMatchObject({ operation: "CREATE", resourceId: booked.data.appointment._id });
        expect(String(receipts[0].actorUserId)).toBe(String(receptionUsers[0]._id));
        expect(await Patient.countDocuments()).toBe(1);
        expect(await Appointment.countDocuments({ patient: patientId, status: "scheduled" })).toBe(3);
        expect(await Appointment.countDocuments({ patient: patientId, status: "scheduled", date: { $gte: day } })).toBe(1);
        for (const original of historical) {
            expect(await Appointment.findById(original._id).lean()).toEqual(original);
            expect((await AppointmentBookingGuard.findOne({ patient: patientId, date: original.date })).scheduledCount).toBe(1);
            expect(await WriteOperationAuditLog.countDocuments({ resourceId: String(original._id) })).toBe(0);
        }
    });
    it("keeps today's elapsed-hour appointment pending and still rejects multiple current or future appointments", async () => {
        expect((await book(payload(1))).status).toBe(201);
        const original = await Appointment.findOne({}).lean();
        // Keep clock and real authenticated session unchanged. Only this
        // synthetic fixture's appointment hour is earlier than the test clock.
        await Appointment.updateOne({ _id: original._id }, { $set: { time: "00:01" } });
        const lookupPath = `/api/reception/patient-lookup?clinic=${clinic}&ramq=${patient(1).num_assurance_maladie}`;
        const lookup = await request(lookupPath, { token: tokens[0] });
        expect(lookup.data.existingAppointments).toEqual([{ _id: String(original._id), date: day, time: "00:01" }]);
        expect(lookup.data.hasHistoricalScheduledAppointments).toBeUndefined();
        const body = { clinic, patientId: String(original.patient), specialist: doctors[0], date: day, time: times[1], slotType: "walk_in", bookingProof: lookup.data.bookingProof };
        const optionsPath = `/api/reception/walk-in-options?clinic=${clinic}&patient=${original.patient}`;
        expect((await request(optionsPath, { token: tokens[0] })).status).toBe(409);
        expect((await book(body)).status).toBe(409);
        expect((await Appointment.findById(original._id)).status).toBe("scheduled");
        const { _id, __v, createdAt, updatedAt, ...fields } = original;
        const future = await Appointment.create({ ...fields, date: "2099-01-16", time: "08:00", status: "scheduled" });
        const ambiguous = await request(lookupPath, { token: tokens[0] });
        expect(ambiguous.data.existingAppointments.map(item => item._id)).toEqual([String(original._id), String(future._id)]);
        const before = await counts();
        const options = await request(`${optionsPath}&replaceAppointmentId=${original._id}`, { token: tokens[0] });
        expect(options.status).toBe(409);
        const refused = await book({ ...body, bookingProof: ambiguous.data.bookingProof, replaceAppointmentId: String(original._id) });
        expect(refused.status).toBe(409);
        expect(refused.meta?.writeVerification).toBeUndefined();
        expect(await counts()).toEqual(before);
        expect(await Appointment.countDocuments({ status: "scheduled" })).toBe(2);
    });
});


describe("8. Explicit reception administrative attendance", () => {
    async function seedHistory(count = 1) {
        const patientId = await seedKnownPatient();
        const template = await Appointment.findOne({ patient: patientId }).lean();
        const rows = [];
        for (let i = 0; i < count; i++) {
            const { _id, __v, createdAt, updatedAt, ...fields } = template;
            const row = await Appointment.create({ ...fields, date: `2099-01-${13 + i}`, status: "scheduled",
                ...(i === 1 ? { attendanceResolution: null } : {}) });
            rows.push(row);
            await AppointmentBookingGuard.create({ patient: patientId, specialist: doctors[0], date: row.date, scheduledCount: 1 });
        }
        return { patientId, rows, template };
    }
    const queryHistory = (patientId, bookingProof, actor = 0, extra = {}) => request("/api/reception/historical-appointments/query", {
        token: tokens[actor], body: { clinic, patientId, bookingProof, ...extra } });
    const declareAttendance = (patientId, appointmentId, bookingProof, outcome = "attended", actor = 0, gate, extra = {}) =>
        request(`/api/reception/historical-appointments/${appointmentId}/attendance`, { token: tokens[actor], method: "PATCH", gate,
            body: { clinic, patientId, bookingProof, outcome, ...extra } });

    it("resolves absent and null legacy history by explicit patient statement, preserves clinical notes and continues booking with rotated proofs", async () => {
        const { patientId, rows } = await seedHistory(2);
        let proof = await lookupProof(patientId);
        const firstList = await queryHistory(patientId, proof);
        expect(firstList.status).toBe(200);
        expect(firstList.data).toEqual({ appointments: rows.map(row => ({ _id: String(row._id), date: row.date, time: row.time })), hasMore: false });
        const ownerBefore = String((await Patient.findById(patientId)).ownerUserId);
        const guardsBefore = await AppointmentBookingGuard.find({ patient: patientId }).sort({ date: 1 }).lean();
        const ids = [];
        for (const [index, outcome] of ["attended", "not_attended"].entries()) {
            const row = rows[index];
            const response = await declareAttendance(patientId, String(row._id), proof, outcome);
            expect(response.status).toBe(200);
            expect(response.data).toEqual({ appointment: { _id: String(row._id), date: row.date, time: row.time, attendanceResolution: { outcome } }, bookingProof: expect.stringMatching(/^[a-f0-9]{64}$/) });
            expect(response.data.bookingProof).not.toBe(proof);
            expect(response.meta.writeVerification.status).toBe("CONFIRMED");
            ids.push(response.meta.writeVerification.verificationId);
            const persisted = await Appointment.findById(row._id).lean();
            expect(persisted.status).toBe("scheduled");
            expect(persisted.attendanceResolution).toEqual({ outcome, recordedAt: expect.any(Date), recordedByUserId: receptionUsers[0]._id, source: "patient_statement" });
            expect(String(persisted.ownerUserId)).toBe(String(row.ownerUserId));
            const receipt = await WriteOperationAuditLog.findOne({ verificationId: ids[index] }).lean();
            expect(receipt).toMatchObject({ operation: "UPDATE", resourceId: String(row._id), changedFields: ["attendanceResolution"] });
            expect(String(receipt.actorUserId)).toBe(String(receptionUsers[0]._id));
            expect(receipt.writeConcern).toMatchObject(CLINICAL_WRITE_CONCERN);
            expect((await queryHistory(patientId, proof)).status).toBe(403);
            proof = response.data.bookingProof;
            const remaining = await queryHistory(patientId, proof);
            expect(remaining.data.appointments).toHaveLength(1 - index);
        }
        expect(new Set(ids).size).toBe(2);
        expect(await AppointmentBookingGuard.find({ patient: patientId }).sort({ date: 1 }).lean()).toEqual(guardsBefore);
        expect(String((await Patient.findById(patientId)).ownerUserId)).toBe(ownerBefore);
        expect(await PatientConsultationNote.countDocuments()).toBe(0);
        // Exercise the actual physician service, rather than inferring note
        // permissions solely from an unchanged status string.
        const physician = { userId: String(physicianUsers[0]._id), role: "MEDECIN" };
        for (const row of rows) {
            expect((await readConsultation(String(row._id), physician, { ip: "127.0.0.1" })).canAddNote).toBe(true);
            expect((await addConsultationNote(String(row._id), "SYNTHETIC_ATTENDANCE_PERMISSION_NOTE", physician, { ip: "127.0.0.1" }))._id).toBeTruthy();
        }
        expect(await PatientConsultationNote.countDocuments()).toBe(2);
        const lookup = await request(`/api/reception/patient-lookup?clinic=${clinic}&ramq=${patient(1).num_assurance_maladie}`, { token: tokens[0] });
        expect(lookup.data.hasHistoricalScheduledAppointments).toBeUndefined();
        const booking = await book({ clinic, patientId, specialist: doctors[0], date: day, time: times[1], slotType: "walk_in", bookingProof: proof });
        expect(booking.status).toBe(201);
        expect(booking.meta.writeVerification.verificationId).not.toBe(ids[0]);
        expect(await Patient.countDocuments()).toBe(1);
        expect(await Appointment.countDocuments({ patient: patientId, status: "scheduled", date: { $gte: day } })).toBe(1);
    });

    it("rejects missing or foreign proofs, current/future/foreign records and overwriting an existing resolution", async () => {
        const { patientId, rows, template } = await seedHistory();
        const proof = await lookupProof(patientId);
        for (const body of [{}, { bookingProof: "forged" }, { bookingProof: proof, patientId: String(new mongoose.Types.ObjectId()) }]) {
            expect((await queryHistory(patientId, body.bookingProof, 0, body)).status).toBe(403);
        }
        expect((await queryHistory(patientId, proof, 1)).status).toBe(403);
        expect((await queryHistory(patientId, proof, 0, { clinic: otherClinic })).status).toBe(403);
        const { _id, __v, createdAt, updatedAt, ...fields } = template;
        const excluded = await Appointment.create([
            { ...fields, date: day, time: times[2], status: "scheduled" },
            { ...fields, date: "2099-01-16", status: "scheduled" },
            { ...fields, date: "2099-01-12", clinique: otherClinic, status: "scheduled" },
            { ...fields, date: "2099-01-11", status: "completed" },
        ]);
        const listed = await queryHistory(patientId, proof);
        expect(listed.data.appointments.map(row => row._id)).toEqual([String(rows[0]._id)]);
        const before = await counts();
        for (const row of excluded) {
            const refused = await declareAttendance(patientId, String(row._id), proof);
            expect(refused.status).toBe(409);
            expect(refused.error.code).toBe("RECEPTION_HISTORY_CONFLICT");
            expect(refused.meta).toBeUndefined();
        }
        for (const extra of [{ status: "completed" }, { notes: "FORGED_SYNTHETIC_NOTE" }]) {
            expect((await declareAttendance(patientId, String(rows[0]._id), proof, "attended", 0, undefined, extra)).status).toBe(400);
        }
        expect((await declareAttendance(patientId, String(rows[0]._id), proof, "completed")).status).toBe(400);
        expect(await counts()).toEqual(before);
        const success = await declareAttendance(patientId, String(rows[0]._id), proof);
        expect(success.status).toBe(200);
        const resolved = await Appointment.findById(rows[0]._id).lean();
        const overwrite = await declareAttendance(patientId, String(rows[0]._id), success.data.bookingProof, "not_attended");
        expect(overwrite.status).toBe(409);
        expect(await Appointment.findById(rows[0]._id).lean()).toEqual(resolved);
    });

    it("rolls back resolution, both audits and proof rotation on audit or fresh-proof insertion failure", async () => {
        const { patientId, rows } = await seedHistory();
        const proof = await lookupProof(patientId);
        const original = await Appointment.findById(rows[0]._id).lean();
        const before = await counts();
        const proofsBefore = await ReceptionBookingProof.find({}).lean();
        for (const model of [WriteOperationAuditLog, ReceptionBookingProof]) {
            const collection = model.collection.collectionName;
            await mongoose.connection.db.command({ collMod: collection, validator: { $jsonSchema: { required: ["__synthetic_required_field"] } }, validationLevel: "strict" });
            try {
                const response = await declareAttendance(patientId, String(rows[0]._id), proof);
                expect(response.status).toBe(500);
                expect(response.meta).toBeUndefined();
                expect(response.data).toBeUndefined();
                expect(await counts()).toEqual(before);
                expect(await Appointment.findById(rows[0]._id).lean()).toEqual(original);
                expect(await ReceptionBookingProof.find({}).lean()).toEqual(proofsBefore);
            } finally { await mongoose.connection.db.command({ collMod: collection, validator: {} }); }
        }
        const success = await declareAttendance(patientId, String(rows[0]._id), proof);
        expect(success.status).toBe(200);
        expect(success.meta.writeVerification.status).toBe("CONFIRMED");
        expect((await queryHistory(patientId, success.data.bookingProof)).data.appointments).toEqual([]);
    });

    it("allows exactly one explicit declaration in a race and preserves the losing actor's proof", async () => {
        const { patientId, rows } = await seedHistory();
        const proofs = await Promise.all([lookupProof(patientId, 0), lookupProof(patientId, 1)]);
        const before = await counts();
        const results = await race(gate => declareAttendance(patientId, String(rows[0]._id), proofs[0], "attended", 0, gate),
            gate => declareAttendance(patientId, String(rows[0]._id), proofs[1], "not_attended", 1, gate));
        expect(results.map(result => result.status).sort()).toEqual([200, 409]);
        const winner = results.findIndex(result => result.status === 200);
        const loser = 1 - winner;
        const row = await Appointment.findById(rows[0]._id).lean();
        expect(row.status).toBe("scheduled");
        expect(row.attendanceResolution.outcome).toBe(winner === 0 ? "attended" : "not_attended");
        expect(String(row.attendanceResolution.recordedByUserId)).toBe(String(receptionUsers[winner]._id));
        const after = await counts();
        expect(after.writeAudits).toBe(before.writeAudits + 1);
        expect(after.patientAudits).toBe(before.patientAudits + 1);
        expect(after.appointments).toBe(before.appointments);
        expect(after.guards).toBe(before.guards);
        expect((await queryHistory(patientId, proofs[loser], loser)).status).toBe(200);
        expect((await queryHistory(patientId, proofs[winner], winner)).status).toBe(403);
        expect((await queryHistory(patientId, results[winner].data.bookingProof, winner)).data.appointments).toEqual([]);
    });
});
