import { afterEach, beforeEach, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import express from "express";
import { once } from "node:events";
import receptionRouter from "../routes/reception.js";
import { AdminUser } from "../models/AdminUser.js";
import { Clinique } from "../models/Clinique.js";
import { Specialist } from "../models/Specialist.js";
import { Patient } from "../models/Patient.js";
import { Appointment } from "../models/Appointment.js";
import { PatientAuditLog } from "../models/PatientAuditLog.js";
import { WriteOperationAuditLog } from "../models/WriteOperationAuditLog.js";
import { AppointmentBookingGuard } from "../models/AppointmentBookingGuard.js";
import { CLINICAL_WRITE_CONCERN } from "../db/clinicalWriteConcern.js";

// Real router, DTOs, services, indexes, audits and MongoDB transactions.
// Only wall-clock Date and the authenticated identity are test-controlled.
// Login/JWT validation and browser rendering have their separate tests.
const day = "2099-01-15";
const tomorrow = "2099-01-16";
let ownsDatabase = false;
let server;
let base;
let clinic;
let urgentologists;
let family;
let auth;
const slots = Array.from({ length: 24 }, (_, i) => `${String(8 + Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);

async function request(path, body) {
    const response = await fetch(`${base}${path}`, body ? {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    } : {});
    return { status: response.status, ...await response.json() };
}
const options = () => request(`/walk-in-options?clinic=${clinic}`);
const identity = number => ({ nom: `Walkin_${number}`, prenom: "Fictif", num_assurance_maladie: `TEST${String(number).padStart(8, "0")}`, country: "CA", healthInsuranceJurisdiction: "QC", language: "fr" });
const book = (number, specialist, time, date = day) => request("/walk-in-bookings", {
    clinic, specialist: String(specialist), date, time, patient: identity(number), slotType: "walk_in",
});

beforeEach(async () => {
    ownsDatabase = false;
    server = undefined;
    const uri = process.env.CLINIA_WALKIN_TEST_URI || "";
    if (process.env.NODE_ENV !== "test" || !/^mongodb:\/\/127\.0\.0\.1:\d+\/clinia_walkin_integration\?directConnection=true&replicaSet=walkin_test$/.test(uri)) {
        throw new Error("Use npm run test:walkin: only its disposable local replica set is allowed.");
    }
    await mongoose.connect(uri, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 10000 });
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    expect(hello.setName).toBe("walkin_test");
    // Refuse to erase a pre-existing database, even with the expected test name.
    expect(await mongoose.connection.db.listCollections().toArray()).toHaveLength(0);
    ownsDatabase = true;
    for (const model of Object.values(mongoose.models)) {
        await model.createCollection();
        await model.createIndexes();
    }
    // Freeze Date only: socket/driver timers and transaction retries remain real.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${day}T07:00:00-05:00`));
    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const [location] = await Clinique.create([{ nom: "clinique_1", num_civique: "1", rue: "Rue fictive", code_postal: "H0H0H0" }], { session });
            clinic = String(location._id);
            const users = [];
            for (const username of ["reception_1", "urgentologue_1", "urgentologue_2", "medecin_1"]) {
                const [user] = await AdminUser.create([{ username, email: `${username}@example.invalid`, passwordHash,
                    role: username === "reception_1" ? "RECEPTION" : "MEDECIN", isActive: true,
                    assignedClinics: username === "reception_1" ? [location._id] : [],
                }], { session });
                users.push(user);
            }
            auth = { userId: String(users[0]._id), username: "reception_1", role: "RECEPTION", sessionId: "integration-session" };
            urgentologists = [];
            for (let i = 1; i <= 3; i++) {
                const [doctor] = await Specialist.create([{ nom: users[i].username, prenom: "Fictif", numero_medecin: `TEST${i}`,
                    specialite: i < 3 ? "Urgentologue" : "Medecin de famille", accountUserId: users[i]._id, clinique_associer: location._id,
                    practiceLocations: [{ clinique: location._id, disponibilites: [],
                        // More than 20 slots: the limit, not exhausted configured times, must block booking 21.
                        walkInDisponibilites: i < 3 ? slots.map(time => new Date(`${day}T${time}:00-05:00`)) : [new Date(`${tomorrow}T09:00:00-05:00`)],
                    }],
                }], { session });
                if (i < 3) urgentologists.push(String(doctor._id)); else family = String(doctor._id);
            }
        }, { writeConcern: CLINICAL_WRITE_CONCERN });
    } finally { await session.endSession(); }
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.auth = auth; next(); });
    app.use(receptionRouter);
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
    try {
        if (server) await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
        if (ownsDatabase) {
            expect(mongoose.connection.name).toBe("clinia_walkin_integration");
            await mongoose.connection.dropDatabase();
            expect(await mongoose.connection.db.listCollections().toArray()).toHaveLength(0);
            console.log("CLEANUP_OK isolated test database empty, including audits and booking guards.");
        }
    } finally { vi.useRealTimers(); await mongoose.disconnect(); }
});

it.each([false, true])("a walk-in returns the same day using the same dossier (different physician: %s)", async differentPhysician => {
    const { updateAppointmentStatus } = await import("../services/appointments.js");
    const { countUrgentologistConsultations } = await import("../services/urgentologistCapacity.js");
    const firstDoctor = urgentologists[0];
    const secondDoctor = urgentologists[differentPhysician ? 1 : 0];
    expect((await book(1, firstDoctor, slots[0])).status).toBe(201);
    const first = await Appointment.findOne({ specialist: firstDoctor });
    const patientId = String(first.patient);
    const receivingAccount = await Specialist.findById(firstDoctor);

    // An unfinished booking must still trigger replacement, not a second booking.
    const initialLookup = await request(`/patient-lookup?clinic=${clinic}&ramq=${identity(1).num_assurance_maladie}`);
    expect(initialLookup.status).toBe(200);
    const premature = await request("/walk-in-bookings", {
        clinic, specialist: secondDoctor, date: day, time: slots[1], patientId, bookingProof: initialLookup.data.bookingProof, slotType: "walk_in",
    });
    expect(premature.status).toBe(409);
    expect(premature.error.code).toBe("RECEPTION_REPLAN_REQUIRED");
    expect(await Appointment.countDocuments()).toBe(1);

    await updateAppointmentStatus(String(first._id), "completed", {
        userId: String(receivingAccount.accountUserId), role: "MEDECIN",
    });
    vi.setSystemTime(new Date(`${day}T08:10:00-05:00`));
    expect(await countUrgentologistConsultations(firstDoctor, day)).toBe(1);
    const lookup = await request(`/patient-lookup?clinic=${clinic}&ramq=${identity(1).num_assurance_maladie}`);
    expect(lookup.status).toBe(200);
    expect(lookup.data._id).toBe(patientId);
    expect(lookup.data.existingAppointments).toEqual([]);

    // Leave just one place with the receiving doctor. In the same-doctor case,
    // the completed first consultation plus 18 other patients already count 19.
    const others = differentPhysician ? 19 : 18;
    for (let i = 0; i < others; i++) {
        expect((await book(i + 2, secondDoctor, slots[i + 1])).status).toBe(201);
    }
    expect(await countUrgentologistConsultations(secondDoctor, day)).toBe(19);
    const available = await request(`/walk-in-options?clinic=${clinic}&patient=${patientId}`);
    expect(available.status).toBe(200);
    const option = available.data.today.find(item => item.specialist._id === secondDoctor);
    expect(option).toBeDefined();
    expect(option.slots).not.toContain(first.time);
    const returned = await request("/walk-in-bookings", {
        clinic, specialist: secondDoctor, date: day, time: option.slots[0], patientId, bookingProof: lookup.data.bookingProof, slotType: "walk_in",
    });
    expect(returned.status).toBe(201);
    const visits = await Appointment.find({ patient: patientId, date: day }).sort({ time: 1 }).lean();
    expect(visits).toHaveLength(2);
    expect(visits.map(visit => visit.status)).toEqual(["completed", "scheduled"]);
    expect(visits[0].time).not.toBe(visits[1].time);
    expect(String(visits[1].specialist)).toBe(secondDoctor);
    expect(visits.every(visit => !visit.rescheduledFrom && !visit.rescheduledTo)).toBe(true);
    expect(await Patient.countDocuments()).toBe(others + 1);
    expect(await Appointment.countDocuments()).toBe(others + 2);
    expect(await countUrgentologistConsultations(secondDoctor, day)).toBe(20);
    // At quota, another new patient cannot be booked despite remaining slots.
    expect((await book(99, secondDoctor, slots[23])).error.code).toBe("MAXIMUM_APPOINTMENTS_REACHED");
    expect(await Patient.countDocuments()).toBe(others + 1);
    console.log("RETURN_OK same dossier, two consultations, completed visit preserved in the daily quota.");
});

it("40 walk-ins succeed, the 41st gets alternatives, and the last place is protected against parallel booking", async () => {
    expect(await AdminUser.countDocuments()).toBe(4);
    expect(await Clinique.countDocuments()).toBe(1);
    expect(await Specialist.countDocuments()).toBe(3);
    for (let i = 1; i <= 40; i++) {
        const available = await options();
        expect(available.status).toBe(200);
        expect(available.data.presentation).toBe("urgent_today");
        expect(available.data.today.every(item => urgentologists.includes(item.specialist._id))).toBe(true);
        expect(available.data.future).toEqual([]);
        expect(available.data.urgentologists.allAtCapacity).toBe(false);
        const option = available.data.today.find(item => urgentologists.includes(item.specialist._id));
        expect(option).toBeDefined();
        const response = await book(i, option.specialist._id, option.slots[0]);
        expect(response.status).toBe(201);
    }
    for (const specialist of urgentologists) expect(await Appointment.countDocuments({ specialist, date: day, status: "scheduled" })).toBe(20);
    expect(await Patient.countDocuments()).toBe(40);
    expect(await Appointment.countDocuments()).toBe(40);
    const full = await options();
    expect(full.status).toBe(200);
    expect(full.data.presentation).toBe("alternatives");
    expect(full.data.today).toEqual([]);
    expect(full.data.urgentologists).toEqual({ limit: 20, day, allAtCapacity: true });
    const alternative = full.data.future.find(option => option.specialist._id === family);
    expect(alternative).toMatchObject({ date: tomorrow, slots: ["09:00"] });
    // Looking at alternatives / opting to return tomorrow must not create a dossier.
    expect(await Patient.countDocuments()).toBe(40);
    expect(await Appointment.countDocuments()).toBe(40);
    const auditsBefore = await PatientAuditLog.countDocuments();
    const writesBefore = await WriteOperationAuditLog.countDocuments();
    const guardsBefore = await AppointmentBookingGuard.countDocuments();
    for (const specialist of urgentologists) {
        const refused = await book(41, specialist, slots[20]);
        expect(refused.status).toBe(409);
        expect(refused.error.code).toBe("MAXIMUM_APPOINTMENTS_REACHED");
    }
    // Transaction rollback includes identity, appointment, guard, and audit writes.
    expect(await Patient.countDocuments()).toBe(40);
    expect(await Appointment.countDocuments()).toBe(40);
    expect(await PatientAuditLog.countDocuments()).toBe(auditsBefore);
    expect(await WriteOperationAuditLog.countDocuments()).toBe(writesBefore);
    expect(await AppointmentBookingGuard.countDocuments()).toBe(guardsBefore);
    expect((await book(41, family, "09:00", tomorrow)).status).toBe(201);
    expect(await Patient.countDocuments()).toBe(41);
    expect(await Appointment.countDocuments()).toBe(41);
    console.log("SCENARIO_OK 40 urgent consultations; 41st refused then booked with family physician tomorrow.");

    // Release precisely one place through the real cancellation service, then
    // race different patients AND different slots (not the slot-unique index).
    const { cancelAppointment } = await import("../services/appointments.js");
    const original = await Appointment.findOne({ specialist: urgentologists[0], date: day });
    const doctor = await Specialist.findById(urgentologists[0]);
    await cancelAppointment(String(original._id), { userId: String(doctor.accountUserId), role: "MEDECIN" });
    const race = await Promise.all([book(42, urgentologists[0], slots[21]), book(43, urgentologists[0], slots[22])]);
    expect(race.map(result => result.status).sort()).toEqual([201, 409]);
    expect(race.find(result => result.status === 409).error.code).toBe("MAXIMUM_APPOINTMENTS_REACHED");
    expect(await Appointment.countDocuments({ specialist: urgentologists[0], date: day, status: { $in: ["scheduled", "completed"] } })).toBe(20);
    expect(await Patient.countDocuments()).toBe(42);
    console.log("RACE_OK one success, one quota rejection; no orphan patient from the losing transaction.");
});
