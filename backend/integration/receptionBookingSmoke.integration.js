import { beforeAll, afterAll, afterEach, it, expect } from "vitest";
import mongoose from "mongoose";
import express from "express";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { createAuthRouter } from "../routes/auth.js";
import receptionRouter from "../routes/reception.js";
import { verifyJWT } from "../middleware/verifyJWT.js";
import { requireRole } from "../middleware/requireRole.js";
import { loi25DataLeakGuard } from "../middleware/loi25DataLeakGuard.js";
import { Patient } from "../models/Patient.js";
import { AdminUser } from "../models/AdminUser.js";
import { ReceptionBookingProof } from "../models/ReceptionBookingProof.js";
import { RefreshTokenSession } from "../models/RefreshTokenSession.js";

let server, work, base, owned = false, failure = null;
const root = path.resolve(import.meta.dirname, "../..");
const helperPath = path.join(root, "scripts/reception-booking-smoke-helper.mjs");
const script = path.join(root, "scripts/run-reception-booking-smoke.sh");
const recovery = [];
function child(command, args, env, input) {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, { cwd: path.join(root, "backend"), env, stdio: ["pipe", "pipe", "pipe"] });
        let out = "", err = "";
        proc.stdout.on("data", data => { out += data; });
        proc.stderr.on("data", data => { err += data; });
        proc.on("error", reject);
        proc.on("close", code => resolve({ code, out, err }));
        proc.stdin.end(input);
    });
}
const environment = () => ({ ...process.env, MONGO_URI: process.env.CLINIA_WALKIN_TEST_URI, BASE_URL: base, BACKEND_CONTAINER: "isolated-test", PATH: `${work}:${process.env.PATH}` });
async function run(...args) {
    const result = await child("bash", [script, ...args], environment());
    const directory = result.out.match(/^RECOVERY_DIR=(.+)$/m)?.[1];
    if (directory) recovery.push(directory);
    return result;
}
async function helper(action, id) {
    return child("node", ["--input-type=module", "-", action, id], environment(), await readFile(helperPath));
}
async function expectClean() {
    for (const collection of ["patients", "adminusers", "cliniques", "specialists", "appointments", "appointmentbookingguards", "receptionbookingproofs", "refreshtokensessions"]) {
        expect(await mongoose.connection.db.collection(collection).countDocuments()).toBe(0);
    }
}
beforeAll(async () => {
    const uri = process.env.CLINIA_WALKIN_TEST_URI || "";
    if (process.env.NODE_ENV !== "test" || !/^mongodb:\/\/127\.0\.0\.1:\d+\/clinia_walkin_integration\?directConnection=true&replicaSet=walkin_test$/.test(uri)) throw new Error("Disposable launcher required");
    process.env.JWT_ACCESS_SECRET = randomBytes(48).toString("hex");
    process.env.JWT_REFRESH_SECRET = randomBytes(48).toString("hex");
    await mongoose.connect(uri, { autoCreate: false, autoIndex: false });
    expect((await mongoose.connection.db.admin().command({ hello: 1 })).setName).toBe("walkin_test");
    expect(await mongoose.connection.db.listCollections().toArray()).toHaveLength(0);
    owned = true;
    // Imports above register API models; helper-only models need indices too.
    await import("../models/Clinique.js");
    for (const model of Object.values(mongoose.models)) { await model.createCollection(); await model.createIndexes(); }
    work = await mkdtemp(path.join(tmpdir(), "clinia-smoke-test-"));
    // Docker shim executes the exact stdin helper against this disposable DB.
    await writeFile(path.join(work, "docker"), '#!/bin/bash\nset -eu\n[[ "$1 $2 $3 $4 $5" == "exec -i -w /app isolated-test" ]]\nshift 5\nexec "$@"\n', { mode: 0o700 });
    const app = express();
    app.use(express.json());
    app.get("/api/health/ready", (_, res) => res.json({ data: { status: "ok", dependencies: { mongo: "connected" } } }));
    app.use("/api/reception", verifyJWT, requireRole("RECEPTION"), loi25DataLeakGuard, (req, res, next) => {
        if (failure && req.method === "POST") return res.status(failure).json({ error: { code: "TEST_FAILURE" } });
        next();
    }, receptionRouter);
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${server.address().port}`;
    process.env.CLINIA_ALLOWED_ORIGINS = base;
    app.use("/api/auth", createAuthRouter());
});
afterAll(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (owned) { expect(mongoose.connection.name).toBe("clinia_walkin_integration"); await mongoose.connection.dropDatabase(); }
    await mongoose.disconnect();
    if (work) await rm(work, { recursive: true, force: true });
    for (const directory of recovery) await rm(directory, { recursive: true, force: true });
});
afterEach(async () => {
    failure = null;
    // Isolate failures between tests, only on the verified disposable database.
    if (owned) {
        expect(mongoose.connection.name).toBe("clinia_walkin_integration");
        for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    }
});
it("executes real curl login/lookup/booking/replay/logout and exact cleanup while retaining audits", async () => {
    const result = await run();
    expect(result, result.out + result.err).toMatchObject({ code: 0 });
    expect(result.out).toContain("REPLAY_REFUSED HTTP=403 RECEPTION_LOOKUP_REQUIRED");
    expect(result.out).toContain("BOOKING_DB_OK count=1");
    expect(result.out).toContain("CLEANUP_OK operational_fixtures=0 audits=retained");
    expect(result.out).toContain("RECEPTION_BOOKING_SMOKE_PASSED");
    await expectClean();
    expect(await mongoose.connection.db.collection("patientauditlogs").countDocuments()).toBeGreaterThan(0);
    expect(await mongoose.connection.db.collection("writeoperationauditlogs").countDocuments()).toBeGreaterThan(0);
});
it("cleans fixtures after a definitive HTTP refusal without reporting success", async () => {
    failure = 409;
    const result = await run();
    failure = null;
    expect(result.code).toBe(1);
    expect(result.out).toContain("CLEANUP_OK");
    expect(result.out).not.toContain("RECEPTION_BOOKING_SMOKE_PASSED");
    await expectClean();
});
it("quarantines an ambiguous upstream failure and supports idempotent recovery", async () => {
    failure = 504;
    const result = await run();
    failure = null;
    expect(result.code).toBe(1);
    expect(result.out).toContain("CLEANUP_UNCONFIRMED");
    expect(result.out).not.toContain("CLEANUP_OK");
    expect(await Patient.countDocuments()).toBe(1);
    expect(await AdminUser.countDocuments({ isActive: true })).toBe(0);
    const id = result.out.match(/^RUN_ID=(.+)$/m)[1];
    expect((await run("--cleanup", id)).code).toBe(0);
    expect((await run("--cleanup", id)).code).toBe(0);
    await expectClean();
});
it("refuses cleanup if a fixture ownership marker changed", async () => {
    const id = randomUUID();
    const seed = await helper("seed", id);
    expect(seed.code, seed.err).toBe(0);
    const fixture = JSON.parse(seed.out);
    const marker = (await Patient.findById(fixture.patientId)).created_by_reference;
    await Patient.updateOne({ _id: fixture.patientId }, { $set: { created_by_reference: "FOREIGN" } });
    expect((await helper("cleanup", id)).code).toBe(1);
    expect(await AdminUser.countDocuments()).toBe(2);
    expect(await Patient.countDocuments()).toBe(1);
    await Patient.updateOne({ _id: fixture.patientId }, { $set: { created_by_reference: marker } });
    expect((await helper("cleanup", id)).code).toBe(0);
    await expectClean();
});
it("preserves a different synthetic run while cleaning the completed run", async () => {
    const otherId = randomUUID();
    const seed = await helper("seed", otherId);
    expect(seed.code).toBe(0);
    const other = JSON.parse(seed.out);
    const result = await run();
    expect(result.code, result.out + result.err).toBe(0);
    expect(await Patient.countDocuments()).toBe(1);
    expect(await Patient.exists({ _id: other.patientId })).toBeTruthy();
    expect(await AdminUser.countDocuments({ isActive: true })).toBe(2);
    expect((await helper("cleanup", otherId)).code).toBe(0);
    await expectClean();
});
it("refuses destructive cleanup of foreign references but still disables owned accounts", async () => {
    const id = randomUUID();
    const seed = await helper("seed", id);
    expect(seed.code).toBe(0);
    const fixture = JSON.parse(seed.out);
    const reception = await AdminUser.findOne({ username: fixture.username });
    const proof = await ReceptionBookingProof.create({ userId: reception._id, clinicId: fixture.clinic,
        patientId: new mongoose.Types.ObjectId(), sessionId: "synthetic", tokenHash: randomBytes(32).toString("hex"), expiresAt: new Date(Date.now() + 60000) });
    expect((await helper("cleanup", id)).code).toBe(1);
    expect(await ReceptionBookingProof.exists({ _id: proof._id })).toBeTruthy();
    expect((await helper("disable", id)).code).toBe(0);
    expect(await AdminUser.countDocuments({ isActive: true })).toBe(0);
    await ReceptionBookingProof.deleteOne({ _id: proof._id });
    expect((await helper("cleanup", id)).code).toBe(0);
    await expectClean();
});
