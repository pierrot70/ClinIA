import mongoose from "mongoose";
import { issueReceptionBookingProof, consumeReceptionBookingProof, validateReceptionBookingProof } from "./receptionBookingProof.js";

import { AdminUser } from "../models/AdminUser.js";
import { Patient } from "../models/Patient.js";
import { Specialist } from "../models/Specialist.js";
import { Appointment } from "../models/Appointment.js";
import { Clinique } from "../models/Clinique.js";
import { WalkInWaitlistEntry } from "../models/WalkInWaitlistEntry.js";
import { orderedWalkInClinics, WALK_IN_RADIUS_KM, WALK_IN_TOLERANCE_KM, WALK_IN_MAX_DISTANCE_KM, WALK_IN_EXTENDED_MAX_DISTANCE_KM, WALK_IN_SPECIALTY_PRIORITY } from "./receptionWalkInRouting.js";
import { IPS_SPECIALTY, URGENTOLOGIST_SPECIALTY, URGENTOLOGIST_DAILY_LIMIT, isUrgentologist } from "../domain/specialties.js";
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
import { normalizeTelephone, toUpdatePatientDTO } from "../dto/patient.dto.js";
import { buildPatientSearchKeys, normalizePatientIdentifierSearch } from "../utils/patientSearchKeys.js";

const MAX_FUTURE_OPTIONS = 8;
const MAX_WAITLIST_CLINICS = 2;

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

async function assertReceptionClinicAccess(clinicId, authUser, session = null) {
    if (!mongoose.Types.ObjectId.isValid(clinicId)) {
        throw invalidInput("Clinique invalide.");
    }

    const reception = await AdminUser.findOne({
        _id: authUser?.userId,
        isActive: true,
        role: "RECEPTION",
    }, { assignedClinics: 1 }).session(session).lean();

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
        _id: specialistId, specialite: { $in: WALK_IN_SPECIALTY_PRIORITY },
    }).session(session).lean();
    if (!specialist || !getLocationForClinic(specialist, clinicId)) {
        throw { code: "FORBIDDEN", message: "Ce médecin n'exerce pas dans la clinique sélectionnée." };
    }
    const account = specialist.accountUserId
        ? await AdminUser.findOne({
            _id: specialist.accountUserId, role: specialist.specialite === IPS_SPECIALTY ? "IPS" : "MEDECIN", isActive: true,
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
            specialty: specialist.specialite,
        },
        date,
        slots: schedule.slots,
        slotTypes,
    };
}

// Search only scheduling data. It never creates an identity or appointment.
// Existing-patient filtering requires the exact origin-clinic lookup proof.
export async function listWalkInFamilyMedicineOptions({
    clinicId, patientId = null, replaceAppointmentId = null, bookingProof,
    authUser, now = new Date(), compareEarlier = false, extendedSearchAccepted = false,
}) {
    await assertReceptionClinicAccess(clinicId, authUser);
    if (patientId && !mongoose.Types.ObjectId.isValid(patientId)) throw invalidInput("Patient invalide.");
    if (patientId) {
        await validateReceptionBookingProof({ bookingProof, authUser, clinicId, patientId });
        if (!await Patient.exists({ _id: patientId, archivedAt: null })) throw invalidInput("Patient introuvable.");
    }
    const today = currentSchedulingDay(now);
    const previous = patientId
        ? validateReplacement(await pendingAppointments(patientId, clinicId, today), replaceAppointmentId)
        : null;
    if (!patientId && replaceAppointmentId) throw invalidInput("Patient requis pour replanifier.");
    return searchWalkInOptions({ clinicId, patientId, previous, now, compareEarlier: compareEarlier === true, extendedSearchAccepted });
}

export async function enrollWalkInWaitlist({
    clinicId, insuranceNumber, channel, telephone, telephoneSms, courriel, nom, prenom,
    consent, patientId, bookingProof, replaceAppointmentId, authUser, ip,
}) {
    if (authUser?.role !== "RECEPTION") throw { code: "FORBIDDEN", message: "Accès réservé à la réception." };
    if (consent !== true) throw { code: "WAITLIST_CONSENT_REQUIRED", message: "Le consentement du patient est requis." };
    const insurance = typeof insuranceNumber === "string" && insuranceNumber.length <= 40
        ? normalizePatientIdentifierSearch(insuranceNumber) : "";
    if (insurance.length < 6) throw invalidInput("Numéro d’assurance maladie invalide.");
    const fields = toUpdatePatientDTO(patientId === undefined ? { nom, prenom, telephone, courriel } : { telephone, courriel });
    const smsNumber = normalizeTelephone(telephoneSms);
    const requiredContact = channel === "sms" ? smsNumber
        : channel === "phone" ? fields.telephone
        : channel === "email" ? fields.courriel : undefined;
    if (!requiredContact) {
        throw invalidInput("La coordonnée correspondant au mode de contact est requise.");
    }
    const contactFields = {
        ...(fields.telephone ? { telephone: fields.telephone } : {}),
        ...(smsNumber ? { telephoneSms: smsNumber } : {}),
        ...(fields.courriel ? { courriel: fields.courriel } : {}),
    };

    const session = await mongoose.startSession();
    try {
        return await session.withTransaction(async () => {
            await assertReceptionClinicAccess(clinicId, authUser, session);
            const patient = await Patient.findOne({ healthInsuranceNumberSearch: insurance, archivedAt: null },
                { _id: 1, telephone: 1, telephoneSms: 1, courriel: 1 }).session(session).lean();
            if ((patient ? String(patient._id) : undefined) !== patientId) {
                throw { code: "RECEPTION_LOOKUP_REQUIRED", message: "Recherchez à nouveau le patient." };
            }
            if (!patient && replaceAppointmentId !== undefined) throw invalidInput("Patient requis pour replanifier.");
            if (patient) await consumeReceptionBookingProof({ bookingProof, authUser, clinicId, patientId, session });
            const now = new Date();
            const previous = patient
                ? validateReplacement(await pendingAppointments(patientId, clinicId, currentSchedulingDay(now), session), replaceAppointmentId)
                : null;
            const availability = await searchWalkInOptions({
                clinicId, patientId, previous, now, session, extendedSearchAccepted: true,
            });
            if (availability.search.status !== "exhausted" || availability.search.maxDistanceKm !== WALK_IN_EXTENDED_MAX_DISTANCE_KM) {
                throw { code: "WAITLIST_SEARCH_CHANGED", message: "Actualisez la recherche de créneaux avant d’inscrire le patient." };
            }

            const record = patient ?? await createPatient({
                nom: fields.nom, prenom: fields.prenom, num_assurance_maladie: insurance,
                country: "CA", healthInsuranceJurisdiction: "QC", ...contactFields,
            }, authUser, { session, walkInWaitlist: true });
            if (patient) {
                // Every enrollment writes the same patient inside this transaction.
                // A concurrent enrollment in another clinic must retry the count.
                const updated = await Patient.updateOne({ _id: patient._id, archivedAt: null }, {
                    $inc: { __v: 1 },
                }, { session, timestamps: false });
                if (updated.matchedCount !== 1) {
                    throw { code: "RECEPTION_LOOKUP_REQUIRED", message: "Recherchez à nouveau le patient." };
                }
                if (await WalkInWaitlistEntry.exists({ patient: patient._id, clinic: clinicId }).session(session)) {
                    throw { code: "WAITLIST_ALREADY_ENROLLED", message: "Ce patient est déjà sur la liste d’attente de cette clinique." };
                }
                const enrolledClinics = await WalkInWaitlistEntry.countDocuments({ patient: patient._id }).session(session);
                if (enrolledClinics >= MAX_WAITLIST_CLINICS) {
                    throw { code: "WAITLIST_CLINIC_LIMIT", message: "Ce patient est déjà sur la liste d’attente de deux cliniques." };
                }
            }
            const [entry] = await WalkInWaitlistEntry.create([{
                clinic: clinicId, patient: record._id, channel, consentedAt: now, enrolledBy: authUser.userId,
            }], { session });

            const changedContacts = Object.fromEntries(Object.entries(contactFields)
                .filter(([key, value]) => patient && value !== patient[key]));
            if (Object.keys(changedContacts).length) {
                const update = { ...changedContacts };
                if (changedContacts.telephone) update.telephoneSearch = buildPatientSearchKeys(contactFields).telephoneSearch;
                await Patient.updateOne({ _id: patient._id, archivedAt: null }, { $set: update }, { session, runValidators: true });
            }
            if (!patient || Object.keys(changedContacts).length) {
                await recordPatientAuditEvent({
                    action: patient ? "PATIENT_UPDATE" : "PATIENT_CREATE", outcome: "SUCCESS",
                    actorUserId: authUser.userId, actorUsername: authUser.username, actorRole: "RECEPTION", ip: ip ?? null,
                    patientId: String(record._id), changedFields: patient ? Object.keys(changedContacts)
                        : ["nom", "prenom", "num_assurance_maladie", ...Object.keys(contactFields)],
                    requestPath: "/api/reception/walk-in-waitlist", session, throwOnError: true,
                });
            }
            await recordWriteOperationAuditEvent({
                collectionName: "walkinwaitlistentries", operation: "CREATE", outcome: "SUCCESS",
                actorUserId: authUser.userId, actorUsername: authUser.username, actorRole: "RECEPTION",
                ip: ip ?? null, resourceId: String(entry._id), patientId: String(record._id),
                receptionClinicId: clinicId, requestPath: "/api/reception/walk-in-waitlist",
                writeConcern: CLINICAL_WRITE_CONCERN, session, throwOnError: true,
            });
            return { _id: String(entry._id) };
        }, { writeConcern: CLINICAL_WRITE_CONCERN });
    } catch (error) {
        if (error?.code === 11000 && error.keyPattern?.clinic && error.keyPattern?.patient) {
            throw { code: "WAITLIST_ALREADY_ENROLLED", message: "Ce patient est déjà sur la liste d’attente de cette clinique." };
        }
        if (error?.code === 11000 && error.keyPattern?.healthInsuranceNumberSearch) {
            throw { code: "RECEPTION_LOOKUP_REQUIRED", message: "Recherchez à nouveau le patient." };
        }
        if (error?.code === 11000 && error.keyPattern?.telephoneSearch) {
            throw { code: "WAITLIST_CONTACT_IN_USE", message: "Vérifiez le numéro de téléphone saisi." };
        }
        throw error;
    } finally {
        await session.endSession();
    }
}

async function clinicSpecialtyOptions({ candidate, specialty, active, patientId, previous, now, session, before = null }) {
    const destinationId = String(candidate.clinic._id);
    const today = currentSchedulingDay(now);
    const options = [];
    let urgentologistCount = 0, urgentologistsAtCapacity = 0;
    for (const specialist of active.filter(s => s.specialite === specialty)) {
        const location = getLocationForClinic(specialist, destinationId);
        if (!location) continue;
        const urgentologist = isUrgentologist(specialty);
        if (urgentologist) {
            urgentologistCount++;
            if (await countUrgentologistConsultations(specialist._id, today, { session, excludeAppointmentId: previous?._id }) >= URGENTOLOGIST_DAILY_LIMIT) urgentologistsAtCapacity++;
        }
        const slotTypes = patientId && !urgentologist ? ["regular", "walk_in"] : ["walk_in"];
        const configuredSlots = slotTypes.flatMap(type => type === "walk_in" ? location.walkInDisponibilites || [] : location.disponibilites || []);
        const dates = [...new Set(configuredSlots.map(toSchedulingDateKey).filter(date => date && !isSchedulingDatePast(date, now) && (!before || date <= before.slice(0, 10))))].sort();
        for (const date of dates) {
            // A MongoDB transaction must not run simultaneous queries
            // on the same session, including regular/walk-in merging.
            const schedules = [];
            for (const slotType of slotTypes) {
                schedules.push(await getAvailableSlotSchedule(String(specialist._id), date, {
                    clinique: destinationId, ...(patientId ? { patient: String(patientId) } : {}),
                    ...(previous ? { excludeAppointmentId: String(previous._id) } : {}), slotType, session, now,
                }));
            }
            const slotTypesByTime = {};
            for (let index = 0; index < schedules.length; index++) {
                for (const time of schedules[index].slots) {
                    if (previous && String(previous.specialist) === String(specialist._id) && previous.date === date && previous.time === time) continue;
                    if (!slotTypesByTime[time]) slotTypesByTime[time] = slotTypes[index];
                }
            }
            const slots = Object.keys(slotTypesByTime).sort();
            if (slots.length) options.push(toOption(specialist, date, { slots }, slotTypesByTime));
        }
    }
    const urgentologists = urgentologistCount ? { limit: URGENTOLOGIST_DAILY_LIMIT, day: today, allAtCapacity: urgentologistsAtCapacity === urgentologistCount } : undefined;
    return { options, urgentologists };
}

async function earlierWalkInAlternatives({ primary, geography, active, clinicId, patientId, previous, now, session }) {
    const primaryTimes = [...primary.today, ...primary.future].flatMap(option => option.slots.map(time => `${option.date}T${time}`)).sort();
    if (!primary.selectedClinic || !primaryTimes.length || !geography.originLocated) return [];
    const before = primaryTimes[0];
    const alternatives = [];
    // This secondary, explicitly requested comparison never changes the
    // priority result or automatically selects another appointment.
    for (const candidate of geography.candidates) {
        if (String(candidate.clinic._id) === String(clinicId)) continue;
        for (const specialty of WALK_IN_SPECIALTY_PRIORITY) {
            const { options } = await clinicSpecialtyOptions({ candidate, specialty, active, patientId, previous, now, session, before });
            for (const option of options) {
                const slots = option.slots.filter(time => `${option.date}T${time}` < before);
                if (!slots.length) continue;
                alternatives.push({ ...option, slots, slotTypes: Object.fromEntries(slots.map(time => [time, option.slotTypes[time]])),
                    clinic: { _id: String(candidate.clinic._id), nom: candidate.clinic.nom, distanceKm: candidate.distanceKm }, prioritySpecialty: specialty });
            }
        }
    }
    alternatives.sort((left, right) => `${left.date}T${left.slots[0]}`.localeCompare(`${right.date}T${right.slots[0]}`)
        || left.clinic.distanceKm - right.clinic.distanceKm
        || WALK_IN_SPECIALTY_PRIORITY.indexOf(left.prioritySpecialty) - WALK_IN_SPECIALTY_PRIORITY.indexOf(right.prioritySpecialty)
        || left.clinic._id.localeCompare(right.clinic._id)
        || left.specialist._id.localeCompare(right.specialist._id));
    return alternatives.slice(0, MAX_FUTURE_OPTIONS);
}

function walkInSearchLimit(extended) {
    return extended
        ? { radiusKm: WALK_IN_EXTENDED_MAX_DISTANCE_KM, maxDistanceKm: WALK_IN_EXTENDED_MAX_DISTANCE_KM }
        : { radiusKm: WALK_IN_RADIUS_KM, toleranceKm: WALK_IN_TOLERANCE_KM, maxDistanceKm: WALK_IN_MAX_DISTANCE_KM };
}

async function searchWalkInOptions({ clinicId, patientId, previous, now = new Date(), session = null, compareEarlier = false, extendedSearchAccepted = false }) {
    const today = currentSchedulingDay(now);
    const origin = await Clinique.findOne({ _id: clinicId }, { nom: 1, lat: 1, long: 1 }).session(session).lean();
    if (!origin) throw invalidInput("Clinique introuvable.");
    const specialists = await Specialist.find({ specialite: { $in: WALK_IN_SPECIALTY_PRIORITY } }).session(session).lean();
    const accountIds = [...new Set(specialists.filter(s => s.accountUserId).map(s => String(s.accountUserId)))];
    const accounts = accountIds.length ? await AdminUser.find({ _id: { $in: accountIds }, role: { $in: ["MEDECIN", "IPS"] }, isActive: true }, { _id: 1, role: 1 }).session(session).lean() : [];
    const activeAccounts = new Map(accounts.map(account => [String(account._id), account.role]));
    const active = specialists.filter(s => WALK_IN_SPECIALTY_PRIORITY.includes(s.specialite)
        && activeAccounts.get(String(s.accountUserId)) === (s.specialite === IPS_SPECIALTY ? "IPS" : "MEDECIN"));
    const clinicIds = [...new Set(active.flatMap(s => getPracticeLocations(s).map(location => location.clinique)))];
    const clinics = clinicIds.length ? await Clinique.find({ _id: { $in: clinicIds } }, { nom: 1, lat: 1, long: 1 }).session(session).lean() : [];
    const localGeography = orderedWalkInClinics(origin, clinics);
    // A wider search is only meaningful after all potentially local clinics
    // could be checked. In distance order, local offers still take precedence.
    const useExtended = extendedSearchAccepted === true && localGeography.originLocated && !localGeography.hasUnlocatedClinics;
    const geography = useExtended ? orderedWalkInClinics(origin, clinics, WALK_IN_EXTENDED_MAX_DISTANCE_KM) : localGeography;
    let examinedClinics = 0;
    let originUrgentologists;
    for (const candidate of geography.candidates) {
        examinedClinics++;
        const destinationId = String(candidate.clinic._id);
        for (const specialty of WALK_IN_SPECIALTY_PRIORITY) {
            const { options, urgentologists } = await clinicSpecialtyOptions({ candidate, specialty, active, patientId, previous, now, session });
            if (destinationId === String(clinicId) && specialty === URGENTOLOGIST_SPECIALTY) originUrgentologists = urgentologists;
            if (!options.length) continue;
            options.sort((left, right) => `${left.date}T${left.slots[0]}`.localeCompare(`${right.date}T${right.slots[0]}`)
                || `${left.specialist.prenom || ""} ${left.specialist.nom || ""}`.localeCompare(`${right.specialist.prenom || ""} ${right.specialist.nom || ""}`, "fr")
                || left.specialist._id.localeCompare(right.specialist._id));
            const outsideLocalLimit = candidate.distanceKm > WALK_IN_MAX_DISTANCE_KM;
            const result = {
                presentation: "priority", selectedClinic: { _id: destinationId, nom: candidate.clinic.nom, distanceKm: candidate.distanceKm }, prioritySpecialty: specialty,
                search: { ...walkInSearchLimit(outsideLocalLimit), status: "found", distanceMode: "straight_line", examinedClinics,
                    ...(geography.hasUnlocatedClinics ? { hasUnlocatedClinics: true } : {}) },
                today: options.filter(option => option.date === today), future: options.filter(option => option.date > today).slice(0, MAX_FUTURE_OPTIONS),
                ...(urgentologists || originUrgentologists ? { urgentologists: urgentologists || originUrgentologists } : {}),
            };
            if (compareEarlier) result.earlierAlternatives = await earlierWalkInAlternatives({
                primary: result, geography: outsideLocalLimit ? geography : localGeography, active, clinicId, patientId, previous, now, session,
            });
            return result;
        }
    }
    return {
        presentation: "priority", today: [], future: [],
        ...(compareEarlier ? { earlierAlternatives: [] } : {}),
        search: { ...walkInSearchLimit(useExtended), status: !geography.originLocated || geography.hasUnlocatedClinics ? "location_missing" : "exhausted", distanceMode: "straight_line", examinedClinics,
            ...(geography.hasUnlocatedClinics ? { hasUnlocatedClinics: true } : {}) },
        ...(originUrgentologists ? { urgentologists: originUrgentologists } : {}),
    };
}

async function assertWalkInDestination({ originClinicId, clinicId, specialistId, patientId = null, previous = null, date, time, slotType = "walk_in", selectionMode = "priority", extendedSearchAccepted = false, session, authUser }) {
    await assertReceptionClinicAccess(originClinicId, authUser, session);
    if (!mongoose.Types.ObjectId.isValid(clinicId)) throw invalidInput("Clinique invalide.");
    if (!["priority", "earlier"].includes(selectionMode)) throw invalidInput("Mode de sélection invalide.");
    const options = await searchWalkInOptions({ clinicId: originClinicId, patientId, previous, session, compareEarlier: selectionMode === "earlier", extendedSearchAccepted });
    const selected = selectionMode === "earlier"
        ? options.earlierAlternatives?.find(option => option.clinic._id === String(clinicId) && option.specialist._id === String(specialistId) && option.date === date && option.slots.includes(time))
        : options.selectedClinic?._id === String(clinicId)
            && [...options.today, ...options.future].find(option => option.specialist._id === String(specialistId) && option.date === date && option.slots.includes(time));
    if (!selected) throw { code: "NO_AVAILABILITY", message: "Le créneau ou la clinique prioritaire a changé. Recherchez les disponibilités à nouveau." };
    // The merged display has one preferred slot type per time. A legacy
    // client may choose its other genuinely configured type at that time.
    const schedule = await getAvailableSlotSchedule(String(specialistId), date, {
        clinique: String(clinicId), ...(patientId ? { patient: String(patientId) } : {}),
        ...(previous ? { excludeAppointmentId: String(previous._id) } : {}), slotType, session,
    });
    if (!schedule.slots.includes(time)) throw { code: "NO_AVAILABILITY", message: "Ce créneau n'est plus disponible. Recherchez les disponibilités à nouveau." };
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
                patientId, resourceId: String(appointment._id), receptionClinicId: clinicId, changedFields: ["attendanceResolution"],
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
    originClinicId = clinicId,
    selectionMode = "priority",
    extendedSearchAccepted = false,
    specialistId,
    date,
    time,
    patientDto,
    authUser,
    audit = {},
}) {
    await assertReceptionClinicAccess(originClinicId, authUser);

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
            await assertWalkInDestination({ originClinicId, clinicId, specialistId, date, time, selectionMode, extendedSearchAccepted, session, authUser });
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
                { session, patientFromTransaction: patient, receivingPhysicianUserId, receptionOriginClinicId: originClinicId }
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
                receptionClinicId: originClinicId,
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
    originClinicId = clinicId,
    selectionMode = "priority",
    extendedSearchAccepted = false,
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
    await assertReceptionClinicAccess(originClinicId, authUser);

    if (!mongoose.Types.ObjectId.isValid(patientId)) {
        throw invalidInput("Patient invalide.");
    }

    const session = await mongoose.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            const receivingPhysicianUserId = await requireActiveReceivingPhysician(specialistId, clinicId, session);
            await consumeReceptionBookingProof({ bookingProof, authUser, clinicId: originClinicId, patientId, session });
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
            const previous = validateReplacement(await pendingAppointments(patientId, originClinicId, today, session), replaceAppointmentId);
            if (String(originClinicId) !== String(clinicId) && (await pendingAppointments(patientId, clinicId, today, session)).length) throw replacementConflict();
            if (previous && String(previous.specialist) === String(specialistId) && previous.date === date && previous.time === time) throw invalidInput("Choisissez un autre créneau.");
            await assertWalkInDestination({ originClinicId, clinicId, specialistId, patientId, previous, date, time, slotType, selectionMode, extendedSearchAccepted, session, authUser });
            if (previous) {
                const changed = await Appointment.updateOne({ _id: previous._id, patient: patientId, clinique: originClinicId, status: "scheduled" },
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
                { session, patientFromTransaction: patient, receivingPhysicianUserId, receptionOriginClinicId: originClinicId, ...(previous ? { excludeAppointmentId: String(previous._id) } : {}) }
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
                    receptionClinicId: originClinicId,
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
                receptionClinicId: originClinicId,
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
