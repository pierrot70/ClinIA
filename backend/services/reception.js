import mongoose from "mongoose";
import { issueReceptionBookingProof, consumeReceptionBookingProof, validateReceptionBookingProof } from "./receptionBookingProof.js";

import { AdminUser } from "../models/AdminUser.js";
import { Patient } from "../models/Patient.js";
import { Specialist } from "../models/Specialist.js";
import { Appointment } from "../models/Appointment.js";
import { URGENTOLOGIST_SPECIALTY, URGENTOLOGIST_DAILY_LIMIT, isUrgentologist } from "../domain/specialties.js";
import { countUrgentologistConsultations } from "./urgentologistCapacity.js";
import { recordPatientAuditEvent } from "../audit/patientAudit.js";
import { recordWriteOperationAuditEvent } from "../audit/writeOperationAudit.js";
import { CLINICAL_WRITE_CONCERN } from "../db/clinicalWriteConcern.js";
import {
    createAppointment,
    getAvailableSlotSchedule,
    getPracticeLocations,
    releaseDailyAppointmentCapacity,
} from "./appointments.js";
import { createPatient } from "./patients.js";
import { isSchedulingDatePast, toSchedulingDateKey } from "../utils/schedulingTime.js";
import { normalizePatientIdentifierSearch } from "../utils/patientSearchKeys.js";

const FAMILY_MEDICINE_SPECIALTY = "Medecin de famille";
const MAX_FUTURE_OPTIONS = 8;

function replacementConflict() {
    return { code: "RECEPTION_REPLAN_REQUIRED", message: "Le rendez-vous existant a changé ou plusieurs rendez-vous sont planifiés. Recherchez à nouveau le patient avant de replanifier." };
}

function currentSchedulingDay(now = new Date()) {
    const today = toSchedulingDateKey(now);
    if (!today) throw { code: "PERSISTENCE_FAILED", message: "Date de planification indisponible." };
    return today;
}

async function pendingAppointments(patientId, clinicId, today, session = null) {
    return Appointment.find({ patient: patientId, clinique: clinicId, status: "scheduled", date: { $gte: today } },
        { _id: 1, date: 1, time: 1, specialist: 1 }).session(session).sort({ date: 1, time: 1 }).limit(2).lean();
}

function validateReplacement(pending, replacementId) {
    if (pending.length === 0 && !replacementId) return null;
    if (pending.length !== 1 || typeof replacementId !== "string" || String(pending[0]._id) !== replacementId) {
        throw replacementConflict();
    }
    return pending[0];
}

function invalidInput(message) {
    return { code: "INVALID_INPUT", message };
}

async function assertReceptionClinicAccess(clinicId, authUser) {
    if (!mongoose.Types.ObjectId.isValid(clinicId)) {
        throw invalidInput("Clinique invalide.");
    }

    const reception = await AdminUser.findOne({
        _id: authUser?.userId,
        isActive: true,
        role: "RECEPTION",
    }, { assignedClinics: 1 }).lean();

    if (!reception) {
        throw { code: "FORBIDDEN", message: "Compte réception invalide ou inactif." };
    }

    const assignedClinics = (reception.assignedClinics || []).map(String);
    if (!assignedClinics.includes(String(clinicId))) {
        throw { code: "FORBIDDEN", message: "Cette clinique n'est pas attribuée à ce compte réception." };
    }
}

function getLocationForClinic(specialist, clinicId) {
    return getPracticeLocations(specialist).find(
        (location) => location.clinique === String(clinicId)
    );
}

// Resolve ownership from the professional directory, never from client input.
async function requireActiveReceivingPhysician(specialistId, clinicId, session) {
    if (!mongoose.Types.ObjectId.isValid(specialistId)) throw invalidInput("Médecin invalide.");
    const specialist = await Specialist.findOne({
        _id: specialistId, specialite: { $in: [FAMILY_MEDICINE_SPECIALTY, URGENTOLOGIST_SPECIALTY] },
    }).session(session).lean();
    if (!specialist || !getLocationForClinic(specialist, clinicId)) {
        throw { code: "FORBIDDEN", message: "Ce médecin n'exerce pas dans la clinique sélectionnée." };
    }
    const account = specialist.accountUserId
        ? await AdminUser.findOne({
            _id: specialist.accountUserId, role: "MEDECIN", isActive: true,
        }, { _id: 1 }).session(session).lean()
        : null;
    if (!account) {
        throw { code: "RECEIVING_PHYSICIAN_UNAVAILABLE", message: "Ce médecin n'est plus lié à un compte ClinIA actif. Choisissez un autre médecin actif." };
    }
    return String(account._id);
}

function toOption(specialist, date, schedule, slotTypes = {}) {
    return {
        specialist: {
            _id: String(specialist._id),
            nom: specialist.nom,
            prenom: specialist.prenom,
            ...(isUrgentologist(specialist.specialite) ? { specialty: URGENTOLOGIST_SPECIALTY } : {}),
        },
        date,
        slots: schedule.slots,
        slotTypes,
    };
}

// This read-only search deliberately receives no patient identifier. It is
// used before a new patient agrees to a visit, so no patient record or
// appointment can be created by merely looking for capacity.
export async function listWalkInFamilyMedicineOptions({
    clinicId,
    patientId = null,
    replaceAppointmentId = null,
    authUser,
    now = new Date(),
}) {
    await assertReceptionClinicAccess(clinicId, authUser);

    if (patientId && !mongoose.Types.ObjectId.isValid(patientId)) {
        throw invalidInput("Patient invalide.");
    }
    if (patientId) {
        const patientExists = await Patient.exists({ _id: patientId, archivedAt: null });
        if (!patientExists) {
            throw invalidInput("Patient introuvable.");
        }
    }
    const today = currentSchedulingDay(now);
    const previous = patientId
        ? validateReplacement(await pendingAppointments(patientId, clinicId, today), replaceAppointmentId)
        : null;
    if (!patientId && replaceAppointmentId) throw invalidInput("Patient requis pour replanifier.");

    const specialists = await Specialist.find({
        specialite: { $in: [FAMILY_MEDICINE_SPECIALTY, URGENTOLOGIST_SPECIALTY] },
    }).lean();

    const accountIds = specialists.filter(s => getLocationForClinic(s, clinicId) && s.accountUserId)
        .map(s => s.accountUserId);
    const activeAccounts = accountIds.length ? await AdminUser.find({
        _id: { $in: accountIds }, role: "MEDECIN", isActive: true,
    }, { _id: 1 }).lean() : [];
    const activeAccountIds = new Set(activeAccounts.map(account => String(account._id)));

    const todayOptions = [];
    const futureCandidates = [];
    let urgentologistCount = 0;
    let urgentologistsAtCapacity = 0;

    for (const specialist of specialists) {
        if (!specialist.accountUserId || !activeAccountIds.has(String(specialist.accountUserId))) continue;
        const location = getLocationForClinic(specialist, clinicId);
        if (!location) continue;
        const urgentologist = isUrgentologist(specialist.specialite);
        if (urgentologist) {
            urgentologistCount++;
            if (await countUrgentologistConsultations(specialist._id, today, { excludeAppointmentId: previous?._id }) >= URGENTOLOGIST_DAILY_LIMIT) urgentologistsAtCapacity++;
        }

        // A person already known to the clinic may still arrive without an
        // appointment. They can therefore use either their regular slots or
        // the capacity the physician explicitly reserved for walk-ins. A new
        // patient remains restricted to walk-in capacity.
        const slotTypes = patientId && !urgentologist
            ? ["regular", "walk_in"]
            : ["walk_in"];
        const configuredSlots = slotTypes.flatMap((slotType) =>
            slotType === "walk_in"
                ? location.walkInDisponibilites || []
                : location.disponibilites || []
        );
        const dates = [...new Set(
            configuredSlots
                .map(toSchedulingDateKey)
                .filter((date) => date && !isSchedulingDatePast(date, now))
        )].sort();

        for (const date of dates) {
            const schedules = await Promise.all(
                slotTypes.map((slotType) =>
                    getAvailableSlotSchedule(
                        String(specialist._id),
                        date,
                        {
                            clinique: String(clinicId),
                            ...(patientId ? { patient: String(patientId) } : {}),
                            ...(previous ? { excludeAppointmentId: String(previous._id) } : {}),
                            slotType,
                        }
                    )
                )
            );
            const slotTypesByTime = {};
            const slots = [];
            schedules.forEach((schedule, index) => {
                schedule.slots.forEach((time) => {
                    if (previous && String(previous.specialist) === String(specialist._id) && previous.date === date && previous.time === time) return;
                    if (slotTypesByTime[time]) return;
                    slotTypesByTime[time] = slotTypes[index];
                    slots.push(time);
                });
            });
            slots.sort();
            if (slots.length === 0) continue;

            const option = toOption(specialist, date, { slots }, slotTypesByTime);
            if (date === today) {
                todayOptions.push(option);
            } else {
                futureCandidates.push(option);
            }
        }
    }

    const sortOptions = (left, right) =>
        `${left.date}T${left.slots[0]}`.localeCompare(`${right.date}T${right.slots[0]}`) ||
        `${left.specialist.prenom} ${left.specialist.nom}`.localeCompare(
            `${right.specialist.prenom} ${right.specialist.nom}`,
            "fr"
        );

    // Reception offers today's urgentologist slots first. Family medicine is
    // the alternative when none remain, not a competing initial choice.
    const urgentToday = todayOptions.filter(option => option.specialist.specialty === URGENTOLOGIST_SPECIALTY);
    const hasUrgentToday = urgentToday.length > 0;
    return {
        presentation: hasUrgentToday ? "urgent_today" : "alternatives",
        today: (hasUrgentToday ? urgentToday : todayOptions).sort(sortOptions),
        future: hasUrgentToday ? [] : futureCandidates
            .filter(option => option.specialist.specialty !== URGENTOLOGIST_SPECIALTY)
            .sort(sortOptions).slice(0, MAX_FUTURE_OPTIONS),
        ...(urgentologistCount ? { urgentologists: { limit: URGENTOLOGIST_DAILY_LIMIT, day: today,
            allAtCapacity: urgentologistsAtCapacity === urgentologistCount } } : {}),
    };
}

// A reception lookup is intentionally exact, limited to an assigned clinic,
// and returns no clinical profile, contact details, or insurance number.
export async function findReceptionPatientByRamq({ clinicId, ramq, authUser, audit = {}, now = new Date() }) {
    await assertReceptionClinicAccess(clinicId, authUser);

    const normalizedRamq = normalizePatientIdentifierSearch(ramq);
    if (!normalizedRamq) {
        throw invalidInput("Numéro d'assurance maladie requis.");
    }

    const patient = await Patient.findOne(
        {
            healthInsuranceNumberSearch: normalizedRamq,
            archivedAt: null,
        },
        { _id: 1, nom: 1, prenom: 1 }
    ).lean();

    await recordPatientAuditEvent({
        action: "RECEPTION_RAMQ_LOOKUP",
        outcome: patient ? "SUCCESS" : "NOT_FOUND",
        actorUserId: audit.actorUserId ?? authUser?.userId ?? null,
        actorUsername: audit.actorUsername ?? authUser?.username ?? null,
        actorRole: "RECEPTION",
        ip: audit.ip ?? null,
        patientId: patient?._id ? String(patient._id) : null,
        requestPath: audit.requestPath ?? "/api/reception/patient-lookup",
    });

    if (!patient) return null;
    // Use one clinic calendar-day snapshot for both sides of this boundary.
    // Historical scheduled records are signalled, never silently reclassified.
    const today = currentSchedulingDay(now);
    const [pending, historical] = await Promise.all([
        pendingAppointments(patient._id, clinicId, today),
        Appointment.exists(historicalAttendanceScope(patient._id, clinicId, today)),
    ]);
    return { _id: String(patient._id), nom: patient.nom, prenom: patient.prenom,
        bookingProof: await issueReceptionBookingProof({ authUser, clinicId, patientId: patient._id }),
        existingAppointments: pending.map(({ _id, date, time }) => ({ _id: String(_id), date, time })),
        ...(historical ? { hasHistoricalScheduledAppointments: true } : {}),
    };
}

const MAX_HISTORICAL_ATTENDANCE_RESULTS = 50;

function historicalAttendanceScope(patientId, clinicId, today) {
    // Mongo null matches both an absent field and an explicitly null legacy field.
    return { patient: patientId, clinique: clinicId, status: "scheduled", date: { $lt: today }, attendanceResolution: null };
}

function assertAttendanceInput({ clinicId, patientId, appointmentId, authUser }) {
    if (authUser?.role !== "RECEPTION") throw { code: "FORBIDDEN", message: "Accès réservé à la réception." };
    for (const id of [clinicId, patientId, ...(appointmentId === undefined ? [] : [appointmentId])]) {
        if (typeof id !== "string" || !/^[a-fA-F0-9]{24}$/.test(id)) throw invalidInput("Identifiant invalide.");
    }
}

export async function listReceptionHistoricalAppointments({ clinicId, patientId, bookingProof, authUser, audit = {}, now = new Date() }) {
    assertAttendanceInput({ clinicId, patientId, authUser });
    await assertReceptionClinicAccess(clinicId, authUser);
    await validateReceptionBookingProof({ bookingProof, authUser, clinicId, patientId });
    if (!await Patient.exists({ _id: patientId, archivedAt: null })) throw invalidInput("Patient introuvable.");
    const rows = await Appointment.find(historicalAttendanceScope(patientId, clinicId, currentSchedulingDay(now)),
        { _id: 1, date: 1, time: 1 }).sort({ date: 1, time: 1, _id: 1 }).limit(MAX_HISTORICAL_ATTENDANCE_RESULTS + 1).lean();
    await recordPatientAuditEvent({ action: "RECEPTION_HISTORY_READ", outcome: "SUCCESS",
        actorUserId: authUser.userId, actorUsername: authUser.username, actorRole: "RECEPTION",
        ip: audit.ip ?? null, patientId, requestPath: "/api/reception/historical-appointments/query", throwOnError: true });
    return { appointments: rows.slice(0, MAX_HISTORICAL_ATTENDANCE_RESULTS).map(({ _id, date, time }) => ({ _id: String(_id), date, time })),
        hasMore: rows.length > MAX_HISTORICAL_ATTENDANCE_RESULTS };
}

export async function recordReceptionHistoricalAttendance({ clinicId, patientId, appointmentId, bookingProof, outcome, authUser, audit = {} }) {
    assertAttendanceInput({ clinicId, patientId, appointmentId, authUser });
    if (typeof appointmentId !== "string") throw invalidInput("Identifiant de rendez-vous requis.");
    if (!["attended", "not_attended"].includes(outcome)) throw invalidInput("Déclaration de présence invalide.");
    await assertReceptionClinicAccess(clinicId, authUser);
    const session = await mongoose.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            await consumeReceptionBookingProof({ bookingProof, authUser, clinicId, patientId, session });
            const patient = await Patient.findOneAndUpdate({ _id: patientId, archivedAt: null }, { $inc: { __v: 1 } },
                { session, new: true, projection: { _id: 1 } }).lean();
            if (!patient) throw invalidInput("Patient introuvable.");
            const today = currentSchedulingDay();
            const appointment = await Appointment.findOneAndUpdate({ _id: appointmentId, ...historicalAttendanceScope(patientId, clinicId, today) },
                { $set: { attendanceResolution: { outcome, recordedAt: new Date(), recordedByUserId: authUser.userId, source: "patient_statement" } } },
                { session, new: true, runValidators: true, projection: { _id: 1, date: 1, time: 1, attendanceResolution: 1 } }).lean();
            if (!appointment) throw { code: "RECEPTION_HISTORY_CONFLICT", message: "Ce rendez-vous n’est plus à régulariser. Actualisez la liste." };
            await recordPatientAuditEvent({ action: "RECEPTION_ATTENDANCE_UPDATE", outcome: "SUCCESS",
                actorUserId: authUser.userId, actorUsername: authUser.username, actorRole: "RECEPTION",
                ip: audit.ip ?? null, patientId, changedFields: ["attendanceResolution"],
                requestPath: "/api/reception/historical-appointments/:id/attendance", session, throwOnError: true });
            await recordWriteOperationAuditEvent({ verificationId: audit.verificationId ?? null, clientMutationId: audit.clientMutationId ?? null,
                replicaSet: audit.replicaSet ?? null, collectionName: "appointments", operation: "UPDATE", outcome: "SUCCESS",
                actorUserId: authUser.userId, actorUsername: authUser.username, actorRole: "RECEPTION", ip: audit.ip ?? null,
                patientId, resourceId: String(appointment._id), changedFields: ["attendanceResolution"],
                requestPath: "/api/reception/historical-appointments/:id/attendance", requestId: audit.requestId ?? null, instanceId: audit.instanceId ?? null,
                writeConcern: CLINICAL_WRITE_CONCERN, session, throwOnError: true });
            // Rotate the consumed proof atomically so the user can resolve the
            // next record or continue booking without a new identity lookup.
            const freshProof = await issueReceptionBookingProof({ authUser, clinicId, patientId, session });
            result = { appointment: { _id: String(appointment._id), date: appointment.date, time: appointment.time,
                attendanceResolution: { outcome: appointment.attendanceResolution.outcome } }, bookingProof: freshProof };
        }, { writeConcern: CLINICAL_WRITE_CONCERN });
        return { ...result, writeAuditRecorded: true };
    } finally {
        await session.endSession();
    }
}

// A new walk-in is deliberately written as one Mongo transaction. If the
// selected slot is no longer free, neither a partial patient record nor an
// appointment is retained.
export async function createWalkInPatientAndAppointment({
    clinicId,
    specialistId,
    date,
    time,
    patientDto,
    authUser,
    audit = {},
}) {
    await assertReceptionClinicAccess(clinicId, authUser);

    const ramq = normalizePatientIdentifierSearch(
        patientDto?.num_assurance_maladie
    );
    if (!ramq) {
        throw invalidInput("Numéro d'assurance maladie requis.");
    }

    const existingPatient = await Patient.exists({
        healthInsuranceNumberSearch: ramq,
        archivedAt: null,
    });
    if (existingPatient) {
        throw {
            code: "PATIENT_ALREADY_EXISTS",
            message: "Un dossier actif existe déjà pour ce numéro d'assurance maladie.",
        };
    }

    const session = await mongoose.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            const receivingPhysicianUserId = await requireActiveReceivingPhysician(specialistId, clinicId, session);
            // Reception creates identity data only, never a clinical profile or
            // notes, even if such fields are forged in the HTTP payload.
            const patient = await createPatient({
                nom: patientDto.nom,
                prenom: patientDto.prenom,
                num_assurance_maladie: patientDto.num_assurance_maladie,
                country: patientDto.country,
                healthInsuranceJurisdiction: patientDto.healthInsuranceJurisdiction,
                language: patientDto.language,
            }, authUser, {
                session,
                receivingPhysicianUserId,
            });
            const appointment = await createAppointment(
                {
                    patient: String(patient._id),
                    specialist: specialistId,
                    clinique: clinicId,
                    date,
                    time,
                    priority: "normal",
                    slotType: "walk_in",
                },
                authUser,
                { session, patientFromTransaction: patient, receivingPhysicianUserId }
            );

            await recordPatientAuditEvent({
                action: "PATIENT_CREATE",
                outcome: "SUCCESS",
                actorUserId: audit.actorUserId ?? authUser?.userId ?? null,
                actorUsername: audit.actorUsername ?? authUser?.username ?? null,
                actorRole: "RECEPTION",
                ip: audit.ip ?? null,
                patientId: String(patient._id),
                changedFields: ["nom", "prenom", "num_assurance_maladie", "ownerUserId"],
                requestPath: audit.requestPath ?? "/api/reception/walk-in-bookings",
                session,
                throwOnError: true,
            });
            await recordWriteOperationAuditEvent({
                verificationId: audit.verificationId ?? null,
                clientMutationId: audit.clientMutationId ?? null,
                replicaSet: audit.replicaSet ?? null,
                collectionName: "appointments",
                operation: "CREATE",
                outcome: "SUCCESS",
                actorUserId: audit.actorUserId ?? authUser?.userId ?? null,
                actorUsername: audit.actorUsername ?? authUser?.username ?? null,
                actorRole: "RECEPTION",
                ip: audit.ip ?? null,
                requestId: audit.requestId ?? null,
                instanceId: audit.instanceId ?? null,
                resourceId: String(appointment._id),
                patientId: String(patient._id),
                changedFields: ["patient", "specialist", "clinique", "date", "time", "status"],
                requestPath: audit.requestPath ?? "/api/reception/walk-in-bookings",
                writeConcern: CLINICAL_WRITE_CONCERN,
                session,
                throwOnError: true,
            });

            result = {
                patient: {
                    _id: String(patient._id),
                    nom: patient.nom,
                    prenom: patient.prenom,
                },
                appointment,
            };
        }, { writeConcern: CLINICAL_WRITE_CONCERN });
        // Reached only after all required audits and the transaction commit.
        return { ...result, writeAuditRecorded: true };
    } catch (err) {
        // Match only the patient identity index, never slot/appointment indexes.
        // Do not expose MongoDB messages or key values (patient identifiers).
        const identityKeys = ["ownerUserId", "country", "healthInsuranceJurisdiction", "healthInsuranceNumberSearch"];
        if (err?.code === 11000 && err.keyPattern &&
            Object.keys(err.keyPattern).length === identityKeys.length &&
            identityKeys.every(key => err.keyPattern[key] === 1)) {
            throw {
                code: "PATIENT_ALREADY_EXISTS",
                message: "Un dossier existe déjà pour ce numéro d'assurance maladie. Recherchez à nouveau le patient avant de réserver.",
            };
        }
        throw err;
    } finally {
        await session.endSession();
    }
}

// A known patient does not need a new dossier. The appointment is still
// created in a transaction and the patient is resolved without the usual
// owner scope: reception already proved access through its clinic assignment
// and the exact RAMQ lookup.
export async function createWalkInAppointmentForExistingPatient({
    clinicId,
    specialistId,
    patientId,
    date,
    time,
    slotType = "walk_in",
    replaceAppointmentId = null,
    bookingProof,
    authUser,
    audit = {},
}) {
    await assertReceptionClinicAccess(clinicId, authUser);

    if (!mongoose.Types.ObjectId.isValid(patientId)) {
        throw invalidInput("Patient invalide.");
    }

    const session = await mongoose.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            const receivingPhysicianUserId = await requireActiveReceivingPhysician(specialistId, clinicId, session);
            await consumeReceptionBookingProof({ bookingProof, authUser, clinicId, patientId, session });
            // All reception bookings for this patient serialize on this document.
            // A transaction retried after a concurrent booking rechecks pending appointments.
            const patient = await Patient.findOneAndUpdate(
                { _id: patientId, archivedAt: null },
                { $inc: { __v: 1 } },
                { session, new: true, projection: { _id: 1, nom: 1, prenom: 1, num_assurance_maladie: 1, healthInsuranceJurisdiction: 1, ownerUserId: 1 } }
            ).lean();
            if (!patient) {
                throw invalidInput("Patient introuvable.");
            }

            // Recompute inside every retry, after the patient lock and proof.
            const today = currentSchedulingDay();
            const previous = validateReplacement(await pendingAppointments(patientId, clinicId, today, session), replaceAppointmentId);
            if (previous) {
                if (String(previous.specialist) === String(specialistId) && previous.date === date && previous.time === time) throw invalidInput("Choisissez un autre créneau.");
                const changed = await Appointment.updateOne({ _id: previous._id, patient: patientId, clinique: clinicId, status: "scheduled" },
                    { $set: { status: "rescheduled" } }, { session });
                if (changed.modifiedCount !== 1) throw replacementConflict();
                await releaseDailyAppointmentCapacity({ patient: patientId, specialist: previous.specialist, date: previous.date, session });
            }

            const appointment = await createAppointment(
                {
                    patient: String(patient._id),
                    specialist: specialistId,
                    clinique: clinicId,
                    date,
                    time,
                    priority: "normal",
                    slotType,
                },
                authUser,
                { session, patientFromTransaction: patient, receivingPhysicianUserId, ...(previous ? { excludeAppointmentId: String(previous._id) } : {}) }
            );

            if (previous) {
                const newLink = await Appointment.updateOne({ _id: appointment._id }, { $set: { rescheduledFrom: previous._id } }, { session });
                const oldLink = await Appointment.updateOne({ _id: previous._id }, { $set: { rescheduledTo: appointment._id } }, { session });
                if (newLink.modifiedCount !== 1 || oldLink.modifiedCount !== 1) throw replacementConflict();
                await recordWriteOperationAuditEvent({
                    verificationId: audit.verificationId ?? null,
                    clientMutationId: audit.clientMutationId ?? null,
                    replicaSet: audit.replicaSet ?? null,
                    collectionName: "appointments", operation: "UPDATE", outcome: "SUCCESS",
                    actorUserId: authUser.userId, actorUsername: authUser.username, actorRole: "RECEPTION",
                    ip: audit.ip ?? null, resourceId: String(previous._id), patientId: String(patientId),
                    requestId: audit.requestId ?? null, instanceId: audit.instanceId ?? null,
                    changedFields: ["status", "rescheduledTo"], requestPath: "/api/reception/walk-in-bookings",
                    writeConcern: CLINICAL_WRITE_CONCERN, session, throwOnError: true,
                });
            }

            await recordWriteOperationAuditEvent({
                verificationId: audit.verificationId ?? null,
                clientMutationId: audit.clientMutationId ?? null,
                replicaSet: audit.replicaSet ?? null,
                collectionName: "appointments",
                operation: "CREATE",
                outcome: "SUCCESS",
                actorUserId: audit.actorUserId ?? authUser?.userId ?? null,
                actorUsername: audit.actorUsername ?? authUser?.username ?? null,
                actorRole: "RECEPTION",
                ip: audit.ip ?? null,
                requestId: audit.requestId ?? null,
                instanceId: audit.instanceId ?? null,
                resourceId: String(appointment._id),
                patientId: String(patient._id),
                changedFields: ["patient", "specialist", "clinique", "date", "time", "status"],
                requestPath: audit.requestPath ?? "/api/reception/walk-in-bookings",
                writeConcern: CLINICAL_WRITE_CONCERN,
                session,
                throwOnError: true,
            });

            result = {
                patient: {
                    _id: String(patient._id),
                    nom: patient.nom,
                    prenom: patient.prenom,
                },
                appointment,
            };
        }, { writeConcern: CLINICAL_WRITE_CONCERN });
        // Reached only after all required audits and the transaction commit.
        return { ...result, writeAuditRecorded: true };
    } finally {
        await session.endSession();
    }
}
