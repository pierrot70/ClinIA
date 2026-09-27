// Executed on stdin inside the selected backend, using its installed models.
// No application bootstrap, .env loading, index creation or raw error output.
import { createHash, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
const [action, run] = process.argv.slice(2);
let mongoose;
try {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(run || "")) throw new Error("invalid_run");
    if (!["seed", "verify", "cleanup", "disable"].includes(action)) throw new Error("invalid_action");
    const load = file => import(pathToFileURL(`${process.cwd()}/${file}`).href);
    ({ default: mongoose } = await load("node_modules/mongoose/index.js"));
    const { default: bcrypt } = await load("node_modules/bcryptjs/index.js");
    const { AdminUser } = await load("models/AdminUser.js");
    const { Clinique } = await load("models/Clinique.js");
    const { Specialist } = await load("models/Specialist.js");
    const { Patient } = await load("models/Patient.js");
    const { Appointment } = await load("models/Appointment.js");
    const { AppointmentBookingGuard } = await load("models/AppointmentBookingGuard.js");
    const { ReceptionBookingProof } = await load("models/ReceptionBookingProof.js");
    const { RefreshTokenSession } = await load("models/RefreshTokenSession.js");
    const { toSchedulingDateKey, toSchedulingTime } = await load("utils/schedulingTime.js");
    const marker = `clinia_booking_smoke_${run}`;
    const id = label => new mongoose.Types.ObjectId(createHash("sha256").update(`${marker}:${label}`).digest("hex").slice(0, 24));
    const ids = Object.fromEntries(["reception", "physician", "clinic", "specialist", "patient"].map(key => [key, id(key)]));
    const ramq = `TEST${run.replaceAll("-", "").toUpperCase()}`;
    const roots = [
        [AdminUser, { _id: ids.reception, username: `${marker}_r`, role: "RECEPTION" }],
        [AdminUser, { _id: ids.physician, username: `${marker}_m`, role: "MEDECIN" }],
        [Clinique, { _id: ids.clinic, nom: marker }],
        [Specialist, { _id: ids.specialist, numero_medecin: marker, accountUserId: ids.physician }],
        [Patient, { _id: ids.patient, created_by_reference: marker, ownerUserId: ids.physician }],
    ];
    await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
    const session = await mongoose.startSession();
    const options = { writeConcern: { w: "majority", j: true, wtimeout: 10000 }, maxCommitTimeMS: 15000 };
    const checkOwnership = async () => {
        for (const [model, filter] of roots) {
            const exists = await model.exists({ _id: filter._id }).session(session);
            if (exists && !await model.exists(filter).session(session)) throw new Error("ownership_mismatch");
        }
        const boundaries = [
            [Appointment, { $or: [{ patient: ids.patient }, { specialist: ids.specialist }, { clinique: ids.clinic }] }, { patient: ids.patient, specialist: ids.specialist, clinique: ids.clinic }],
            [AppointmentBookingGuard, { $or: [{ patient: ids.patient }, { specialist: ids.specialist }] }, { patient: ids.patient, specialist: ids.specialist }],
            [ReceptionBookingProof, { $or: [{ patientId: ids.patient }, { clinicId: ids.clinic }, { userId: ids.reception }] }, { patientId: ids.patient, clinicId: ids.clinic, userId: ids.reception }],
        ];
        for (const [model, touching, owned] of boundaries) {
            if (await model.exists({ $and: [touching, { $nor: [owned] }] }).session(session)) throw new Error("foreign_reference");
        }
    };
    try {
        if (action === "seed") {
            const password = randomBytes(32).toString("hex");
            const passwordHash = await bcrypt.hash(password, 12);
            const slot = new Date();
            slot.setUTCDate(slot.getUTCDate() + 30);
            slot.setUTCHours(15, 0, 0, 0);
            // Refuse a shared identity or reused run before any fixture writes.
            await session.withTransaction(async () => {
                for (const [model, filter] of roots) if (await model.exists({ _id: filter._id }).session(session)) throw new Error("run_exists");
                if (await Patient.exists({ healthInsuranceNumberSearch: ramq }).session(session)) throw new Error("identity_exists");
                await Clinique.create([{ _id: ids.clinic, nom: marker, num_civique: "1", rue: "Synthetic", code_postal: "H0H0H0" }], { session });
                await AdminUser.create([
                    { _id: ids.reception, username: `${marker}_r`, email: `${marker}_r@example.invalid`, passwordHash, role: "RECEPTION", isActive: true, assignedClinics: [ids.clinic] },
                    { _id: ids.physician, username: `${marker}_m`, email: `${marker}_m@example.invalid`, passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12), role: "MEDECIN", isActive: true },
                ], { session, ordered: true });
                await Specialist.create([{ _id: ids.specialist, nom: "Synthetic", prenom: "Smoke", numero_medecin: marker, specialite: "Urgentologue", accountUserId: ids.physician,
                    clinique_associer: ids.clinic, practiceLocations: [{ clinique: ids.clinic, disponibilites: [], walkInDisponibilites: [slot] }] }], { session });
                await Patient.create([{ _id: ids.patient, nom: "Synthetic", prenom: "Smoke", num_assurance_maladie: ramq, country: "CA", healthInsuranceJurisdiction: "QC", language: "fr", ownerUserId: ids.physician, created_by_reference: marker }], { session });
            }, options);
            console.log(JSON.stringify({ username: `${marker}_r`, password, ramq, clinic: ids.clinic, specialist: ids.specialist, patientId: ids.patient, date: toSchedulingDateKey(slot), time: toSchedulingTime(slot), slotType: "walk_in" }));
        } else if (action === "verify") {
            await session.withTransaction(async () => {
                await checkOwnership();
                for (const [model, filter] of roots) if (!await model.exists(filter).session(session)) throw new Error("missing_fixture");
                const filter = { patient: ids.patient, specialist: ids.specialist, clinique: ids.clinic };
                if (await Appointment.countDocuments(filter).session(session) !== 1 || await Appointment.countDocuments({ ...filter, status: "scheduled" }).session(session) !== 1) throw new Error("appointment_count");
            }, options);
            console.log("BOOKING_DB_OK count=1");
        } else {
            await session.withTransaction(async () => {
                if (action === "disable") {
                    for (const [model, filter] of roots.slice(0, 2)) {
                        if (await model.exists({ _id: filter._id }).session(session) && !await model.exists(filter).session(session)) throw new Error("ownership_mismatch");
                    }
                } else await checkOwnership();
                for (const [model, filter] of roots.slice(0, 2)) await model.updateOne(filter, { $set: { isActive: false, activeSessionIds: [], activeSessionId: null } }, { session });
                if (action === "disable") return;
                // Same patient write as the booking transaction: no late booking
                // can commit successfully against a patient removed here.
                await Patient.deleteOne(roots[4][1], { session });
                await Appointment.deleteMany({ patient: ids.patient, specialist: ids.specialist, clinique: ids.clinic }, { session });
                await AppointmentBookingGuard.deleteMany({ patient: ids.patient, specialist: ids.specialist }, { session });
                await ReceptionBookingProof.deleteMany({ userId: ids.reception, clinicId: ids.clinic, patientId: ids.patient }, { session });
                await RefreshTokenSession.deleteMany({ userId: { $in: [ids.reception, ids.physician] } }, { session });
                for (const [model, filter] of roots.slice(0, 4)) await model.deleteOne(filter, { session });
            }, options);
            if (action === "cleanup") {
                for (const [model, filter] of roots) if (await model.exists({ _id: filter._id })) throw new Error("cleanup_incomplete");
                for (const [model, filter] of [
                    [Appointment, { patient: ids.patient }], [AppointmentBookingGuard, { patient: ids.patient }],
                    [ReceptionBookingProof, { $or: [{ userId: ids.reception }, { patientId: ids.patient }, { clinicId: ids.clinic }] }],
                    [RefreshTokenSession, { userId: { $in: [ids.reception, ids.physician] } }],
                ]) if (await model.exists(filter)) throw new Error("cleanup_incomplete");
                console.log("CLEANUP_OK operational_fixtures=0 audits=retained");
            } else console.log("SYNTHETIC_ACCOUNTS_DISABLED");
        }
    } finally { await session.endSession(); }
} catch {
    console.error("SMOKE_HELPER_FAILED (details suppressed; preserve the run identifier)");
    process.exitCode = 1;
} finally { if (mongoose) await mongoose.disconnect(); }
