import { Appointment } from "../models/Appointment.js";
import { AppointmentBookingGuard } from "../models/AppointmentBookingGuard.js";
import { AppointmentCoordinationRequest } from "../models/AppointmentCoordinationRequest.js";
import { Specialist } from "../models/Specialist.js";
import { Patient } from "../models/Patient.js";
import { Clinique } from "../models/Clinique.js";
import mongoose from "mongoose";
import { buildOwnerScope } from "../auth/resourceAccess.js";
import { CLINICAL_WRITE_CONCERN } from "../db/clinicalWriteConcern.js";
import { recordWriteOperationAuditEvent } from "../audit/writeOperationAudit.js";

function getClinicalWriteOptions(session) {
    return session
        ? { ...CLINICAL_WRITE_CONCERN, session }
        : CLINICAL_WRITE_CONCERN;
}

export function getPracticeLocations(specialist) {
    if (Array.isArray(specialist?.practiceLocations) && specialist.practiceLocations.length > 0) {
        return specialist.practiceLocations.map((location) => ({
            clinique: String(location.clinique),
            disponibilites: location.disponibilites || [],
        }));
    }

    if (specialist?.clinique_associer) {
        return [{
            clinique: String(specialist.clinique_associer),
            disponibilites: specialist.disponibilites || [],
        }];
    }

    return [];
}

function hasPracticeLocation(specialist, clinique) {
    return getPracticeLocations(specialist).some(
        (location) => location.clinique === String(clinique)
    );
}

const MAX_SAME_DAY_PATIENT_SPECIALIST_APPOINTMENTS = 2;

function isPatientDateTimeDuplicate(error) {
    const keyPattern = error?.keyPattern || {};
    return error?.code === 11000 && (
        (keyPattern.patient === 1 && keyPattern.date === 1 && keyPattern.time === 1) ||
        error?.message?.includes("patient_date_time_scheduled_unique")
    );
}

function isSpecialistDateTimeDuplicate(error) {
    const keyPattern = error?.keyPattern || {};
    return error?.code === 11000 && (
        (keyPattern.specialist === 1 && keyPattern.date === 1 && keyPattern.time === 1) ||
        error?.message?.includes("specialist_date_time_unique")
    );
}

function patientAlreadyBookedError() {
    return {
        code: "PATIENT_ALREADY_BOOKED",
        message:
            "Ce patient a déjà un rendez-vous planifié à cette date et cette heure.",
    };
}

function specialistAlreadyBookedError() {
    return {
        code: "SPECIALIST_ALREADY_BOOKED",
        message: "Ce créneau est déjà réservé pour ce spécialiste.",
    };
}

function getBookingGuardKey({ patient, specialist, date }) {
    return { patient, specialist, date };
}

async function reserveDailyAppointmentCapacity({ patient, specialist, date, session }) {
    try {
        const guard = await AppointmentBookingGuard.findOneAndUpdate(
            {
                ...getBookingGuardKey({ patient, specialist, date }),
                scheduledCount: {
                    $lt: MAX_SAME_DAY_PATIENT_SPECIALIST_APPOINTMENTS,
                },
            },
            {
                $inc: { scheduledCount: 1 },
                $setOnInsert: getBookingGuardKey({ patient, specialist, date }),
            },
            {
                new: true,
                upsert: true,
                session,
            }
        );

        if (guard) return;
    } catch (error) {
        // A competing request can lose the unique guard-document insert race.
        if (error?.code !== 11000) throw error;
    }

    throw {
        code: "MAXIMUM_APPOINTMENTS_REACHED",
        message:
            "Ce patient a déjà le nombre maximal de rendez-vous avec ce spécialiste pour cette journée.",
    };
}

async function releaseDailyAppointmentCapacity({ patient, specialist, date, session }) {
    await AppointmentBookingGuard.updateOne(
        {
            ...getBookingGuardKey({ patient, specialist, date }),
            scheduledCount: { $gt: 0 },
        },
        { $inc: { scheduledCount: -1 } },
        { session }
    );
}

/* ------------------------------------------------------------------ */
/* Service Appointment                                                 */
/* ------------------------------------------------------------------ */

export async function createAppointment(dto, authUser, { session = null } = {}) {
    /* ---------------- Validation métier ---------------- */

    const ALLOWED_PRIORITIES = ["normal", "urgent"];

    if (!mongoose.Types.ObjectId.isValid(dto.patient)) {
        throw {
            code: "INVALID_INPUT",
            message: "Identifiant patient invalide.",
        };
    }

    if (!ALLOWED_PRIORITIES.includes(dto.priority)) {
        throw {
            code: "INVALID_PRIORITY",
            message: "Priorité invalide (normal ou urgent).",
        };
    }

    if (!isQuarterHourTime(dto.time)) {
        throw {
            code: "INVALID_TIME",
            message: "Le créneau doit être aligné sur 15 minutes.",
        };
    }

    // Date passée
    const appointmentDate = new Date(`${dto.date}T${dto.time}`);
    if (appointmentDate < new Date()) {
        throw {
            code: "INVALID_DATE",
            message: "Impossible de créer un rendez-vous dans le passé.",
        };
    }

    if (!mongoose.Types.ObjectId.isValid(dto.specialist)) {
        throw {
            code: "INVALID_INPUT",
            message: "Identifiant de spécialiste invalide.",
        };
    }

    if (dto.clinique && !mongoose.Types.ObjectId.isValid(dto.clinique)) {
        throw {
            code: "INVALID_INPUT",
            message: "Identifiant de clinique invalide.",
        };
    }

    const patient = await Patient.findOne({
        _id: dto.patient,
        ...buildOwnerScope(authUser),
    }).lean();
    if (!patient) {
        throw {
            code: "INVALID_INPUT",
            message: "Patient introuvable.",
        };
    }

    if (patient.archivedAt) {
        throw {
            code: "PATIENT_ARCHIVED",
            message: "Ce dossier patient est archivé. Aucun rendez-vous ne peut y être ajouté.",
        };
    }

    const specialist = await Specialist.findById(dto.specialist, {
        clinique_associer: 1,
        specialite: 1,
        disponibilites: 1,
        practiceLocations: 1,
    }).lean();
    if (!specialist) {
        throw {
            code: "INVALID_INPUT",
            message: "Spécialiste introuvable.",
        };
    }

    if (dto.clinique) {
        const cliniqueExists = await Clinique.exists({ _id: dto.clinique });

        if (!cliniqueExists) {
            throw {
                code: "INVALID_INPUT",
                message: "Clinique introuvable.",
            };
        }

        if (!hasPracticeLocation(specialist, dto.clinique)) {
            throw {
                code: "INVALID_INPUT",
                message:
                    "Le spécialiste sélectionné n'est pas associé à cette clinique.",
            };
        }
    }

    if (!dto.clinique && getPracticeLocations(specialist).length > 1) {
        throw {
            code: "INVALID_INPUT",
            message: "Une clinique doit être sélectionnée pour ce spécialiste.",
        };
    }

    const availableSlots = await getAvailableSlots(
        dto.specialist,
        dto.date,
        { patient: dto.patient, clinique: dto.clinique }
    );
    if (!availableSlots.includes(dto.time)) {
        throw {
            code: "NO_AVAILABILITY",
            message:
                "Aucun créneau disponible pour ce spécialiste.",
        };
    }

    await reserveDailyAppointmentCapacity({
        patient: dto.patient,
        specialist: dto.specialist,
        date: dto.date,
        session,
    });

    /* ---------------- Persistance ---------------- */

    const appointment = new Appointment({
        ...dto,
        patientInsuranceNumber: patient.num_assurance_maladie || undefined,
        patientInsuranceJurisdiction:
            patient.num_assurance_maladie
                ? patient.healthInsuranceJurisdiction || undefined
                : undefined,
        ownerUserId: patient.ownerUserId || authUser.userId,
    });

    try {
        return await appointment.save(getClinicalWriteOptions(session));
    } catch (error) {
        if (isPatientDateTimeDuplicate(error)) {
            throw patientAlreadyBookedError();
        }
        if (isSpecialistDateTimeDuplicate(error)) {
            throw specialistAlreadyBookedError();
        }
        throw error;
    }
}

/* ------------------------------------------------------------------ */
/* GET appointments                                                    */
/* ------------------------------------------------------------------ */

export async function listAppointments(filters = {}, authUser) {
    const query = buildOwnerScope(authUser);

    if (filters.specialist) query.specialist = filters.specialist;
    if (filters.date) query.date = filters.date;
    if (filters.patientInsuranceNumber) {
        query.patientInsuranceNumber = filters.patientInsuranceNumber;
    }

    return Appointment.find(query)
        .sort({ date: 1, time: 1 })
        .lean();
}

/* ------------------------------------------------------------------ */
/* GET appointment by id                                               */
/* ------------------------------------------------------------------ */

export async function getAppointmentById(id, authUser) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant de rendez-vous invalide.",
        };
    }

    const appointment = await Appointment.findOne({
        _id: id,
        ...buildOwnerScope(authUser),
    }).lean();

    if (!appointment) {
        throw {
            code: "NOT_FOUND",
            message: "Rendez-vous introuvable.",
        };
    }

    return appointment;
}

/* ------------------------------------------------------------------ */
/* Cancel appointment (soft delete)                                   */
/* ------------------------------------------------------------------ */

export async function cancelAppointment(id, authUser, { session = null } = {}) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant de rendez-vous invalide.",
        };
    }

    const appointment = await Appointment.findOne({
        _id: id,
        ...buildOwnerScope(authUser),
    });

    if (!appointment) {
        throw {
            code: "NOT_FOUND",
            message: "Rendez-vous introuvable.",
        };
    }

    if (appointment.status === "cancelled") {
        throw {
            code: "ALREADY_CANCELLED",
            message: "Ce rendez-vous est déjà annulé.",
        };
    }

    const releasesDailyCapacity = appointment.status === "scheduled";
    appointment.status = "cancelled";
    await appointment.save(getClinicalWriteOptions(session));
    if (releasesDailyCapacity) {
        await releaseDailyAppointmentCapacity({
            patient: appointment.patient,
            specialist: appointment.specialist,
            date: appointment.date,
            session,
        });
    }

    return appointment;
}

/* ------------------------------------------------------------------ */
/* Update appointment status                                           */
/* ------------------------------------------------------------------ */

const ALLOWED_STATUSES = ["scheduled", "cancelled", "completed"];

export async function updateAppointmentStatus(id, newStatus, authUser, { session = null } = {}) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant de rendez-vous invalide.",
        };
    }

    if (!ALLOWED_STATUSES.includes(newStatus)) {
        throw {
            code: "INVALID_STATUS",
            message:
                "Statut invalide. Valeurs autorisées : scheduled, cancelled, completed.",
        };
    }

    const appointment = await Appointment.findOne({
        _id: id,
        ...buildOwnerScope(authUser),
    });

    if (!appointment) {
        throw {
            code: "NOT_FOUND",
            message: "Rendez-vous introuvable.",
        };
    }

    if (appointment.status === "cancelled") {
        throw {
            code: "STATUS_IMMUTABLE",
            message:
                "Un rendez-vous annulé ne peut pas être modifié.",
        };
    }

    if (
        appointment.status === "completed" &&
        newStatus !== "completed"
    ) {
        throw {
            code: "STATUS_IMMUTABLE",
            message:
                "Un rendez-vous complété ne peut pas être modifié.",
        };
    }

    const releasesDailyCapacity =
        appointment.status === "scheduled" && newStatus !== "scheduled";

    appointment.status = newStatus;
    await appointment.save(getClinicalWriteOptions(session));
    if (releasesDailyCapacity) {
        await releaseDailyAppointmentCapacity({
            patient: appointment.patient,
            specialist: appointment.specialist,
            date: appointment.date,
            session,
        });
    }

    return appointment;
}

/* ------------------------------------------------------------------ */
/* Update appointment schedule (date/time)                             */
/* ------------------------------------------------------------------ */

export async function updateAppointmentSchedule(id, { date, time }, authUser, { session = null } = {}) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant de rendez-vous invalide.",
        };
    }

    if (!date || !time) {
        throw {
            code: "INVALID_INPUT",
            message: "Les champs 'date' et 'time' sont requis.",
        };
    }

    if (!isQuarterHourTime(time)) {
        throw {
            code: "INVALID_TIME",
            message: "Le créneau doit être aligné sur 15 minutes.",
        };
    }

    const appointmentDate = new Date(`${date}T${time}`);
    if (appointmentDate < new Date()) {
        throw {
            code: "INVALID_DATE",
            message: "Impossible de déplacer un rendez-vous dans le passé.",
        };
    }

    const appointment = await Appointment.findOne({
        _id: id,
        ...buildOwnerScope(authUser),
    });

    if (!appointment) {
        throw {
            code: "NOT_FOUND",
            message: "Rendez-vous introuvable.",
        };
    }

    if (appointment.status !== "scheduled") {
        throw {
            code: "STATUS_IMMUTABLE",
            message:
                "Un rendez-vous annulé ou complété ne peut pas être modifié.",
        };
    }

    const availableSlots = await getAvailableSlots(
        String(appointment.specialist),
        date,
        {
            patient: String(appointment.patient),
            excludeAppointmentId: String(appointment._id),
            clinique: appointment.clinique ? String(appointment.clinique) : null,
        }
    );
    if (!availableSlots.includes(time)) {
        throw {
            code: "NO_AVAILABILITY",
            message: "Aucun créneau disponible pour ce spécialiste.",
        };
    }

    const conflictQuery = Appointment.findOne({
        _id: { $ne: appointment._id },
        specialist: appointment.specialist,
        date,
        time,
        status: "scheduled",
    });
    const conflict =
        typeof conflictQuery?.lean === "function"
            ? await conflictQuery.lean()
            : await conflictQuery;

    if (conflict) {
        throw {
            code: "SPECIALIST_ALREADY_BOOKED",
            message:
                "Ce créneau est déjà réservé pour ce spécialiste.",
        };
    }

    const previousDate = appointment.date;
    const movesToAnotherDay = previousDate !== date;
    if (movesToAnotherDay) {
        await reserveDailyAppointmentCapacity({
            patient: appointment.patient,
            specialist: appointment.specialist,
            date,
            session,
        });
    }

    appointment.date = date;
    appointment.time = time;
    try {
        await appointment.save(getClinicalWriteOptions(session));
    } catch (error) {
        if (isPatientDateTimeDuplicate(error)) {
            throw patientAlreadyBookedError();
        }
        if (isSpecialistDateTimeDuplicate(error)) {
            throw specialistAlreadyBookedError();
        }
        throw error;
    }
    if (movesToAnotherDay) {
        await releaseDailyAppointmentCapacity({
            patient: appointment.patient,
            specialist: appointment.specialist,
            date: previousDate,
            session,
        });
    }

    return appointment;
}

async function runAppointmentWriteTransaction(callback) {
    const session = await mongoose.startSession();

    try {
        let result;
        await session.withTransaction(async () => {
            result = await callback(session);
        }, { writeConcern: CLINICAL_WRITE_CONCERN });
        return result;
    } finally {
        await session.endSession();
    }
}

async function recordAppointmentWriteReceipt(appointment, audit, session) {
    await recordWriteOperationAuditEvent({
        ...audit,
        collectionName: "appointments",
        outcome: "SUCCESS",
        resourceId: String(appointment._id),
        patientId: appointment.patient ? String(appointment.patient) : null,
        session,
        throwOnError: true,
    });
}

async function resolveCoordinationRequestForAppointment(appointment, specialty, session) {
    if (!specialty) return null;

    return AppointmentCoordinationRequest.findOneAndUpdate(
        {
            patient: appointment.patient,
            specialty,
            status: { $in: ["open", "ready_to_schedule"] },
        },
        {
            $set: {
                status: "resolved",
                resolvedAppointment: appointment._id,
                resolvedAt: new Date(),
            },
        },
        { new: true, ...getClinicalWriteOptions(session) }
    ).lean();
}

async function recordCoordinationResolutionReceipt(request, audit, session) {
    if (!request) return;

    await recordWriteOperationAuditEvent({
        ...audit,
        collectionName: "appointmentcoordinationrequests",
        operation: "UPDATE",
        outcome: "SUCCESS",
        resourceId: String(request._id),
        patientId: request.patient ? String(request.patient) : null,
        changedFields: ["resolvedAppointment", "resolvedAt", "status"],
        session,
        throwOnError: true,
    });
}

async function executeAppointmentWriteWithReceipt(writeAppointment, audit, { resolveCoordination = false } = {}) {
    return runAppointmentWriteTransaction(async (session) => {
        const appointment = await writeAppointment(session);
        const resolvedCoordinationRequest = resolveCoordination
            ? await resolveCoordinationRequestForAppointment(
                appointment,
                (await Specialist.findById(appointment.specialist, { specialite: 1 }).lean())?.specialite,
                session
            )
            : null;
        await recordAppointmentWriteReceipt(appointment, audit, session);
        await recordCoordinationResolutionReceipt(
            resolvedCoordinationRequest,
            audit,
            session
        );

        return {
            appointment,
            writeAuditRecorded: true,
        };
    });
}

export function createAppointmentWithWriteVerification(dto, authUser, audit) {
    return executeAppointmentWriteWithReceipt(
        (session) => createAppointment(dto, authUser, { session }),
        { ...audit, operation: "CREATE" },
        { resolveCoordination: true }
    );
}

export function cancelAppointmentWithWriteVerification(id, authUser, audit) {
    return executeAppointmentWriteWithReceipt(
        (session) => cancelAppointment(id, authUser, { session }),
        { ...audit, operation: "DELETE" }
    );
}

export function updateAppointmentStatusWithWriteVerification(id, status, authUser, audit) {
    return executeAppointmentWriteWithReceipt(
        (session) => updateAppointmentStatus(id, status, authUser, { session }),
        { ...audit, operation: "UPDATE" }
    );
}

export function updateAppointmentScheduleWithWriteVerification(id, schedule, authUser, audit) {
    return executeAppointmentWriteWithReceipt(
        (session) => updateAppointmentSchedule(id, schedule, authUser, { session }),
        { ...audit, operation: "UPDATE" }
    );
}

/* ------------------------------------------------------------------ */
/* Available slots                                                     */
/* ------------------------------------------------------------------ */

function formatTime(date) {
    return `${date
        .getHours()
        .toString()
        .padStart(2, "0")}:${date
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;
}

function toLocalDateKey(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate()
    ).padStart(2, "0")}`;
}

function calculateDistanceKm(origin, destination) {
    if (
        !Number.isFinite(origin?.lat) ||
        !Number.isFinite(origin?.long) ||
        !Number.isFinite(destination?.lat) ||
        !Number.isFinite(destination?.long)
    ) {
        return null;
    }

    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const latitudeDelta = toRadians(destination.lat - origin.lat);
    const longitudeDelta = toRadians(destination.long - origin.long);
    const haversine =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(toRadians(origin.lat)) *
            Math.cos(toRadians(destination.lat)) *
            Math.sin(longitudeDelta / 2) ** 2;

    return 2 * 6371 * Math.asin(Math.sqrt(haversine));
}

async function findEarliestSpecialistSchedule(specialistLocations, patientId) {
    let earliest = null;

    for (const candidateLocation of specialistLocations) {
        const { specialist, clinique } = candidateLocation;
        const dates = Array.from(
            new Set(
                (candidateLocation.disponibilites || [])
                    .map(toLocalDateKey)
                    .filter((date) => date && new Date(`${date}T00:00:00`) >= new Date(new Date().toDateString()))
            )
        ).sort();

        for (const date of dates) {
            const schedule = await getAvailableSlotSchedule(
                String(specialist._id),
                date,
                { patient: patientId, clinique }
            );
            const time = schedule.slots[0];
            if (!time) continue;

            const candidate = { specialist, clinique, date, time, schedule };
            if (
                !earliest ||
                `${candidate.date}T${candidate.time}` <
                    `${earliest.date}T${earliest.time}`
            ) {
                earliest = candidate;
            }
        }
    }

    return earliest;
}

function normalizeAppointmentSpecialty(value) {
    const specialty = typeof value === "string" ? value.trim() : "";
    if (!specialty || specialty.length > 100) {
        throw {
            code: "INVALID_INPUT",
            message: "Spécialité invalide.",
        };
    }

    return specialty;
}

export async function listManualAppointmentOptions({ specialty }) {
    const normalizedSpecialty = normalizeAppointmentSpecialty(specialty);
    const specialists = await Specialist.find({
        specialite: normalizedSpecialty,
        clinique_associer: { $ne: null },
    }).lean();
    const specialistLocations = specialists.flatMap((specialist) =>
        getPracticeLocations(specialist).map((location) => ({
            specialist,
            ...location,
        }))
    );
    if (specialistLocations.length === 0) {
        return { cliniques: [], specialists: [] };
    }

    const clinicIds = [
        ...new Set(specialistLocations.map((item) => item.clinique)),
    ];
    const clinics = await Clinique.find({ _id: { $in: clinicIds } }).lean();

    return {
        cliniques: clinics
            .map((clinic) => ({ _id: String(clinic._id), nom: clinic.nom }))
            .sort((left, right) => left.nom.localeCompare(right.nom, "fr")),
        specialists: specialistLocations
            .map(({ specialist, clinique }) => ({
                _id: String(specialist._id),
                nom: specialist.nom,
                prenom: specialist.prenom,
                clinique_associer: clinique,
                specialite: specialist.specialite,
            }))
            .sort((left, right) =>
                `${left.prenom} ${left.nom}`.localeCompare(
                    `${right.prenom} ${right.nom}`,
                    "fr"
                )
            ),
    };
}

export async function createAppointmentCoordinationRequest(
    { patientId, specialty },
    authUser
) {
    if (!mongoose.Types.ObjectId.isValid(patientId)) {
        throw {
            code: "INVALID_INPUT",
            message: "Identifiant patient invalide.",
        };
    }

    const normalizedSpecialty = normalizeAppointmentSpecialty(specialty);
    const patient = await Patient.findOne({
        _id: patientId,
        ...buildOwnerScope(authUser),
    }).lean();
    if (!patient) {
        throw {
            code: "NOT_FOUND",
            message: "Patient introuvable.",
        };
    }

    const activeRequestQuery = {
        patient: patient._id,
        specialty: normalizedSpecialty,
        status: { $in: ["open", "ready_to_schedule"] },
    };
    const existing = await AppointmentCoordinationRequest.findOne(
        activeRequestQuery
    ).lean();
    if (existing) {
        return { request: existing, alreadyOpen: true };
    }

    try {
        const request = new AppointmentCoordinationRequest({
            patient: patient._id,
            ownerUserId: patient.ownerUserId || authUser.userId,
            specialty: normalizedSpecialty,
            status: "open",
            requestedByUserId: authUser.userId,
        });
        await request.save(CLINICAL_WRITE_CONCERN);
        return { request, alreadyOpen: false };
    } catch (error) {
        if (error?.code !== 11000) throw error;

        const concurrentRequest = await AppointmentCoordinationRequest.findOne(
            activeRequestQuery
        ).lean();
        if (concurrentRequest) {
            return { request: concurrentRequest, alreadyOpen: true };
        }
        throw error;
    }
}

/**
 * Finds the closest clinic that can actually offer an appointment for the
 * requested specialty. This is advisory only: createAppointment remains the
 * authoritative, atomic availability check.
 */
export async function findNearestAvailableAppointment(
    { patientId, specialty },
    authUser
) {
    if (!mongoose.Types.ObjectId.isValid(patientId)) {
        throw {
            code: "INVALID_INPUT",
            message: "Identifiant patient invalide.",
        };
    }

    const normalizedSpecialty = normalizeAppointmentSpecialty(specialty);

    const patient = await Patient.findOne({
        _id: patientId,
        ...buildOwnerScope(authUser),
    }).lean();
    if (!patient) {
        throw {
            code: "NOT_FOUND",
            message: "Patient introuvable.",
        };
    }

    if (!Number.isFinite(patient.lat) || !Number.isFinite(patient.long)) {
        throw {
            code: "MISSING_PATIENT_COORDINATES",
            message:
                "Les coordonnées du patient sont requises pour proposer la clinique la plus proche.",
        };
    }

    const specialists = await Specialist.find({
        specialite: normalizedSpecialty,
        clinique_associer: { $ne: null },
    }).lean();
    const specialistLocations = specialists.flatMap((specialist) =>
        getPracticeLocations(specialist).map((location) => ({
            specialist,
            ...location,
        }))
    );
    if (specialistLocations.length === 0) {
        return {
            recommendation: null,
            status: "NO_SPECIALISTS_FOR_SPECIALTY",
        };
    }

    const clinicIds = [...new Set(specialistLocations.map((item) => item.clinique))];
    const clinics = await Clinique.find({ _id: { $in: clinicIds } }).lean();

    const candidates = clinics
        .map((clinic) => ({
            clinic,
            distanceKm: calculateDistanceKm(patient, clinic),
            specialists: specialistLocations.filter(
                (item) => item.clinique === String(clinic._id)
            ),
        }))
        .filter((candidate) => candidate.distanceKm !== null)
        .sort(
            (left, right) =>
                left.distanceKm - right.distanceKm ||
                left.clinic.nom.localeCompare(right.clinic.nom, "fr")
        );

    for (const candidate of candidates) {
        const schedule = await findEarliestSpecialistSchedule(
            candidate.specialists,
            patientId
        );
        if (!schedule) continue;

        return {
            recommendation: {
                clinique: {
                    _id: String(candidate.clinic._id),
                    nom: candidate.clinic.nom,
                    distanceKm: candidate.distanceKm,
                },
                specialist: {
                    _id: String(schedule.specialist._id),
                    nom: schedule.specialist.nom,
                    prenom: schedule.specialist.prenom,
                    specialite: schedule.specialist.specialite,
                },
                date: schedule.date,
                time: schedule.time,
                availableSlots: schedule.schedule.slots,
                existingAppointmentTimes:
                    schedule.schedule.existingAppointmentTimes,
            },
            status: "AVAILABLE",
        };
    }

    return {
        recommendation: null,
        status: "NO_AVAILABLE_SLOTS_FOR_SPECIALTY",
    };
}

function isQuarterHourTime(value) {
    return /^([01]\d|2[0-3]):(00|15|30|45)$/.test(value || "");
}

async function getSpecialistAvailableTimes(specialist, date, clinique = null) {
    const startOfDay = new Date(`${date}T00:00`);
    const endOfDay = new Date(`${date}T23:59:59.999`);

    if (!mongoose.Types.ObjectId.isValid(specialist)) {
        return new Set();
    }

    const specialistDoc = await Specialist.findById(
        specialist,
        { disponibilites: 1, clinique_associer: 1, practiceLocations: 1 }
    ).lean();

    const availableTimes = new Set();

    if (!specialistDoc) {
        return availableTimes;
    }

    const locations = getPracticeLocations(specialistDoc).filter(
        (location) => !clinique || location.clinique === String(clinique)
    );
    const configuredSlots = locations.length
        ? locations.flatMap((location) => location.disponibilites)
        : specialistDoc.disponibilites || [];
    configuredSlots.forEach((slot) => {
        const slotDate = new Date(slot);
        if (slotDate >= startOfDay && slotDate <= endOfDay) {
            availableTimes.add(formatTime(slotDate));
        }
    });

    return availableTimes;
}

export async function getAvailableSlots(
    specialist,
    date,
    { patient = null, excludeAppointmentId = null, authUser = null, clinique = null } = {}
) {
    const schedule = await getAvailableSlotSchedule(specialist, date, {
        patient,
        excludeAppointmentId,
        authUser,
        clinique,
    });

    return schedule.slots;
}

export async function getAvailableSlotSchedule(
    specialist,
    date,
    { patient = null, excludeAppointmentId = null, authUser = null, clinique = null } = {}
) {
    if (!specialist || !date) {
        throw {
            code: "INVALID_INPUT",
            message:
                "Spécialiste et date sont requis pour les créneaux.",
        };
    }

    if (!mongoose.Types.ObjectId.isValid(specialist)) {
        throw {
            code: "INVALID_INPUT",
            message: "Identifiant de spécialiste invalide.",
        };
    }

    const today = new Date();
    const targetDate = new Date(`${date}T00:00`);

    if (targetDate < new Date(today.toDateString())) {
        return {
            slots: [],
            existingAppointmentTimes: [],
            maximumAppointmentsReached: false,
        };
    }

    const now = new Date();

    let latestPatientTime = null;
    let existingAppointmentTimes = [];
    if (patient) {
        if (!mongoose.Types.ObjectId.isValid(patient)) {
            if (authUser) {
                throw {
                    code: "INVALID_INPUT",
                    message: "Identifiant patient invalide.",
                };
            }
        } else if (authUser) {
            const patientExists = await Patient.exists({
                _id: patient,
                ...buildOwnerScope(authUser),
            });

            if (!patientExists) {
                throw {
                    code: "INVALID_INPUT",
                    message: "Patient introuvable.",
                };
            }
        }

        if (mongoose.Types.ObjectId.isValid(patient)) {
            const patientAppointmentsQuery = {
                patient,
                specialist,
                date,
                status: "scheduled",
            };
            if (excludeAppointmentId) {
                patientAppointmentsQuery._id = { $ne: excludeAppointmentId };
            }

            const patientAppointments = await Appointment.find(
                patientAppointmentsQuery,
                { time: 1, _id: 0 }
            ).lean();

            existingAppointmentTimes = patientAppointments
                .map((appointment) => appointment.time)
                .sort();

            latestPatientTime = existingAppointmentTimes.reduce(
                (latest, appointment) =>
                    !latest || appointment > latest
                        ? appointment
                        : latest,
                null
            );
        }
    }

    const maximumAppointmentsReached = existingAppointmentTimes.length >= 2;
    if (maximumAppointmentsReached) {
        return {
            slots: [],
            existingAppointmentTimes,
            maximumAppointmentsReached,
        };
    }

    const specialistTimes = await getSpecialistAvailableTimes(
        specialist,
        date,
        clinique
    );
    if (specialistTimes.size === 0) {
        return {
            slots: [],
            existingAppointmentTimes,
            maximumAppointmentsReached,
        };
    }

    const bookedQuery = { specialist, date, status: "scheduled" };
    if (excludeAppointmentId) {
        bookedQuery._id = { $ne: excludeAppointmentId };
    }

    const booked = await Appointment.find(
        bookedQuery,
        { time: 1, _id: 0 }
    ).lean();

    const bookedTimes = new Set(booked.map((a) => a.time));

    const slots = [...specialistTimes].sort().filter((slot) => {
        if (bookedTimes.has(slot)) return false;

        if (latestPatientTime && slot <= latestPatientTime) return false;

        if (targetDate.toDateString() === now.toDateString()) {
            const slotDate = new Date(`${date}T${slot}`);
            if (slotDate <= now) return false;
        }

        return true;
    });

    return {
        slots,
        existingAppointmentTimes,
        maximumAppointmentsReached,
    };
}

export async function listAppointmentsPaginated({
                                                    page = 1,
                                                    limit = 20,
                                                    specialist,
                                                    clinique,
                                                    status,
                                                    patientInsuranceNumber,
                                                    sortDirection = "asc",
                                                    authUser,
                                                }) {
    const query = buildOwnerScope(authUser);

    if (specialist) query.specialist = specialist;
    if (clinique) query.clinique = clinique;
    if (status) query.status = status;
    if (patientInsuranceNumber)
        query.patientInsuranceNumber = patientInsuranceNumber;

    const sortOrder = sortDirection === "desc" ? -1 : 1;

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
        Appointment.find(query)
            .sort({ date: sortOrder, time: sortOrder })
            .skip(skip)
            .limit(limit)
            .lean(),
        Appointment.countDocuments(query),
    ]);

    const patientIds = Array.from(
        new Set(
            data
                .map((appointment) => appointment.patient)
                .filter(Boolean)
                .map((patientId) => String(patientId))
        )
    );
    const patients = patientIds.length
        ? await Patient.find({
            _id: { $in: patientIds },
            ...buildOwnerScope(authUser),
        })
            .select("_id nom prenom")
            .lean()
        : [];
    const patientNames = new Map(
        patients.map((patient) => [
            String(patient._id),
            `${patient.prenom || ""} ${patient.nom || ""}`.trim() || null,
        ])
    );

    return {
        data: data.map((appointment) => ({
            ...appointment,
            patientName: patientNames.get(String(appointment.patient)) || null,
        })),
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}
