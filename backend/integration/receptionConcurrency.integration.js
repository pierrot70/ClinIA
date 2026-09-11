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
import { CLINICAL_WRITE_CONCERN } from "../db/clinicalWriteConcern.js";

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
const book = (body, actor = 0, gate) => request("/api/reception/walk-in-bookings", { token: tokens[actor], body, gate });
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
        const results = await race(
            gate => book({ ...body, specialist: doctors[0], time: times[1] }, 0, gate),
            gate => book({ ...body, specialist: doctors[1], time: times[2] }, 1, gate),
        );
        expect(results.map(result => result.status).sort()).toEqual([201, 409]);
        expect(results.find(result => result.status === 409).error.code).toBe("RECEPTION_REPLAN_REQUIRED");
        expect(await Patient.countDocuments()).toBe(1);
        expect(await Appointment.countDocuments({ patient: patientId, clinique: clinic, status: "scheduled" })).toBe(1);
        expect(await Appointment.countDocuments({ patient: patientId, status: "completed" })).toBe(1);
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
        expect((await book(payload(1))).status).toBe(201);
        const original = await Appointment.findOne({});
        const body = { clinic, patientId: String(original.patient), specialist: doctors[0], date: day, replaceAppointmentId: String(original._id), slotType: "walk_in" };
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
                expect(await counts()).toEqual(before);
            }
        } finally { await mongoose.connection.db.command({ collMod: collection, validator: {} }); }
        expect((await book(payload(1))).status).toBe(201);
        expect(await counts()).toMatchObject({ patients: 1, appointments: 1, guards: 1, patientAudits: 1, writeAudits: 1 });
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
