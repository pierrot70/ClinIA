// CI exercises the same fixture generator, booking services, and database checks as the manual run.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { buildMatrix } from "../../scripts/walkin-chrome/fixtures.mjs";
import { AdminUser } from "../models/AdminUser.js";
import { Clinique } from "../models/Clinique.js";
import { Patient } from "../models/Patient.js";
import { PatientAuditLog } from "../models/PatientAuditLog.js";
import { WalkInWaitlistEntry } from "../models/WalkInWaitlistEntry.js";
import { enrollWalkInWaitlist, findReceptionPatientByRamq } from "../services/reception.js";

const backend = fileURLToPath(new URL("../", import.meta.url));
const revision = "12345678" + "a".repeat(32);
const fixtures = buildMatrix(20000000, revision);
const controlFixtures = buildMatrix(40000000, revision);
const channels = { appel: "phone", courriel: "email", SMS: "sms" };
const fields = { appel: "telephone", courriel: "courriel", SMS: "telephoneSms" };
const uri = process.env.CLINIA_WALKIN_TEST_URI;
let image, template, target, authUser, state, baselinePatients, baselineEntries;

// The production template runs unchanged in an isolated child with only the disposable URI.
// The temporary image supplies its own build marker; the local checkout stays untouched.
function check(action, index = 0) {
    const source = template.replace("__WALKIN_INPUT__", JSON.stringify({ action, index, fixtures, revision, target, state }));
    const stdout = execFileSync(process.execPath, ["--input-type=module", "-"], {
        cwd: image, input: source, encoding: "utf8", timeout: 20000,
        env: { NODE_ENV: "production", MONGO_URI: uri, TZ: "America/Toronto" },
    });
    return JSON.parse(stdout.trim().split("\n").at(-1));
}

beforeAll(async () => {
    expect(process.env.NODE_ENV).toBe("test");
    expect(uri).toMatch(/^mongodb:\/\/127\.0\.0\.1:\d+\/clinia_walkin_integration\?directConnection=true&replicaSet=walkin_test$/);
    await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000 });
    expect((await mongoose.connection.db.admin().command({ hello: 1 })).setName).toBe("walkin_test");
    expect(await mongoose.connection.db.listCollections().toArray()).toHaveLength(0);
    for (const model of Object.values(mongoose.models)) {
        await model.createCollection();
        await model.createIndexes();
    }

    image = await mkdtemp(path.join(tmpdir(), "clinia-walkin-scenarios-"));
    template = await readFile(new URL("../../scripts/walkin-chrome/mongo-check.template.mjs", import.meta.url), "utf8");
    for (const dir of ["node_modules", "models", "utils"]) await symlink(path.join(backend, dir), path.join(image, dir), "dir");
    await mkdir(path.join(image, "services"));
    await symlink(path.join(backend, "services/reception.js"), path.join(image, "services/reception.js"));
    for (const file of ["validationReports.js", "validationReportFormat.js"]) {
        await copyFile(path.join(backend, "services", file), path.join(image, "services", file));
    }
    await writeFile(path.join(image, "package.json"), JSON.stringify({ type: "module" }));
    await writeFile(path.join(image, "build-revision.json"), JSON.stringify({ commit: revision }));

    const clinics = await Clinique.create(["Normal A", "Normal B", "Clinique fictive WalkIn b07ba073"].map(nom => ({
        nom, lat: -75, long: 1, num_civique: "1", rue: "Test", code_postal: "H0H0H0",
    })));
    const original = clinics.slice(0, 2).map(c => String(c._id));
    const user = await AdminUser.create({ username: "receptioncool1", role: "RECEPTION", isActive: true,
        passwordHash: "unused-test-value", assignedClinics: original });
    target = { clinicId: String(clinics[2]._id), original, userId: String(user._id) };
    authUser = { role: user.role, username: user.username, userId: target.userId, sessionId: randomUUID() };

    // Another run on this build has identically named patients and pre-existing waitlist positions.
    const controls = await Patient.create(controlFixtures.map(f => ({
        nom: f.last, prenom: f.first, num_assurance_maladie: f.insurance, courriel: f.email, ownerUserId: null,
    })));
    await WalkInWaitlistEntry.create(controls.map(p => ({
        patient: p._id, clinic: target.clinicId, enrolledBy: target.userId, channel: "email", consentedAt: new Date(),
    })));
    baselinePatients = await Patient.find().sort({ _id: 1 }).lean();
    baselineEntries = await WalkInWaitlistEntry.find().sort({ _id: 1 }).lean();
    state = check("preflight");
    expect(state.baseEntryIds).toEqual(baselineEntries.map(e => String(e._id)).sort());
    state = check("prepare");
    expect(state.initial.filter(Boolean)).toHaveLength(6);
});

afterAll(async () => {
    try { await mongoose.disconnect(); }
    finally { if (image) await rm(image, { recursive: true, force: true }); }
});

describe.sequential("manual WalkIn matrix on disposable MongoDB", () => {
    it.each(fixtures)("scenario $scenario ($type): $order", async f => {
        const index = f.scenario - 1;
        const type = index < 6 ? "patient" : "walkin";
        expect(f.last).toBe(type + "_" + "ABCDEF"[index % 6] + "_" + revision.slice(0, 8));
        expect(controlFixtures[index].last).toBe(f.last);
        const clinicId = target.clinicId;
        const auditScope = { action: "RECEPTION_RAMQ_LOOKUP", actorUserId: authUser.userId };
        const auditCount = await PatientAuditLog.countDocuments(auditScope);
        const lookup = await findReceptionPatientByRamq({ clinicId, ramq: f.insurance, authUser });
        expect(await PatientAuditLog.countDocuments(auditScope)).toBe(auditCount + 1);
        const event = await PatientAuditLog.findOne(auditScope).sort({ _id: -1 }).lean();
        expect(event).toMatchObject({
            actorRole: "RECEPTION", outcome: f.type === "existant" ? "SUCCESS" : "NOT_FOUND",
            requestPath: "/api/reception/patient-lookup",
        });
        expect(event.patientId?.toString() ?? null).toBe(lookup?._id ?? null);
        expect(JSON.stringify(event)).not.toContain(f.insurance);
        const baseline = await Patient.findOne({ healthInsuranceNumberSearch: f.insurance }).lean();
        if (f.type === "existant") {
            expect(lookup?._id).toBe(state.initial[index].id);
            expect(baseline).toMatchObject({ telephone: f.oldPhone, telephoneSms: f.oldSms, courriel: f.oldEmail });
        } else {
            expect(lookup).toBeNull();
            expect(baseline).toBeNull();
        }
        const enrollment = {
            clinicId, authUser, insuranceNumber: f.insurance, consent: true, channel: channels[f.order[2]],
            nom: f.last, prenom: f.first, telephone: "123", telephoneSms: "456", courriel: "courriel-invalide",
            ...(lookup && { patientId: lookup._id, bookingProof: lookup.bookingProof }),
        };
        const valid = { appel: f.phone, SMS: f.sms, courriel: f.email };
        const entriesBefore = await WalkInWaitlistEntry.countDocuments();
        for (const kind of f.order) {
            await expect(enrollWalkInWaitlist(enrollment)).rejects.toMatchObject({ code: "INVALID_INPUT" });
            expect(await Patient.findOne({ healthInsuranceNumberSearch: f.insurance }).lean()).toEqual(baseline);
            expect(await WalkInWaitlistEntry.countDocuments()).toBe(entriesBefore);
            enrollment[fields[kind]] = valid[kind];
        }
        const entry = await enrollWalkInWaitlist(enrollment);
        const verified = check("verify", index);
        expect(verified).toMatchObject({ scenario: f.scenario, entryId: entry._id, patients: 1, newEntries: 1 });
        state.saved.push(verified);
    });

    it("cleans only this run and restores both original reception assignments", async () => {
        expect(state.saved).toHaveLength(12);
        expect(check("cleanup")).toEqual({ fixturesRemoved: true, assignmentsRestored: true });
        expect(await Patient.find().sort({ _id: 1 }).lean()).toEqual(baselinePatients);
        expect(await WalkInWaitlistEntry.find().sort({ _id: 1 }).lean()).toEqual(baselineEntries);
        expect((await AdminUser.findById(target.userId)).assignedClinics.map(String)).toEqual(target.original);
    });
});
