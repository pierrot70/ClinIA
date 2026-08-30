import mongoose from "mongoose";

import { AdminUser } from "../models/AdminUser.js";
import { Patient } from "../models/Patient.js";
import { Specialist } from "../models/Specialist.js";
import { recordPatientAuditEvent } from "../audit/patientAudit.js";
import { recordWriteOperationAuditEvent } from "../audit/writeOperationAudit.js";
import { CLINICAL_WRITE_CONCERN } from "../db/clinicalWriteConcern.js";
import {
    createAppointment,
    getAvailableSlotSchedule,
    getPracticeLocations,
} from "./appointments.js";
import { createPatient } from "./patients.js";
import { isSchedulingDatePast, toSchedulingDateKey } from "../utils/schedulingTime.js";
import { normalizePatientIdentifierSearch } from "../utils/patientSearchKeys.js";

const FAMILY_MEDICINE_SPECIALTY = "Medecin de famille";
const MAX_FUTURE_OPTIONS = 8;

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

function toOption(specialist, date, schedule, slotTypes = {}) {
    return {
        specialist: {
            _id: String(specialist._id),
            nom: specialist.nom,
            prenom: specialist.prenom,
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

    const today = toSchedulingDateKey(now);
    if (!today) {
        throw { code: "PERSISTENCE_FAILED", message: "Date de planification indisponible." };
    }

    const specialists = await Specialist.find({
        specialite: FAMILY_MEDICINE_SPECIALTY,
    }).lean();

    const todayOptions = [];
    const futureCandidates = [];

    for (const specialist of specialists) {
        const location = getLocationForClinic(specialist, clinicId);
        if (!location) continue;

        // A person already known to the clinic may still arrive without an
        // appointment. They can therefore use either their regular slots or
        // the capacity the physician explicitly reserved for walk-ins. A new
        // patient remains restricted to walk-in capacity.
        const slotTypes = patientId
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
                            slotType,
                        }
                    )
                )
            );
            const slotTypesByTime = {};
            const slots = [];
            schedules.forEach((schedule, index) => {
                schedule.slots.forEach((time) => {
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

    return {
        today: todayOptions.sort(sortOptions),
        future: futureCandidates.sort(sortOptions).slice(0, MAX_FUTURE_OPTIONS),
    };
}

// A reception lookup is intentionally exact, limited to an assigned clinic,
// and returns no clinical profile, contact details, or insurance number.
export async function findReceptionPatientByRamq({ clinicId, ramq, authUser, audit = {} }) {
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

    return patient
        ? { _id: String(patient._id), nom: patient.nom, prenom: patient.prenom }
        : null;
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
            const patient = await createPatient(patientDto, authUser, {
                session,
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
                { session, patientFromTransaction: patient }
            );

            await recordPatientAuditEvent({
                action: "PATIENT_CREATE",
                outcome: "SUCCESS",
                actorUserId: audit.actorUserId ?? authUser?.userId ?? null,
                actorUsername: audit.actorUsername ?? authUser?.username ?? null,
                actorRole: "RECEPTION",
                ip: audit.ip ?? null,
                patientId: String(patient._id),
                changedFields: ["nom", "prenom", "num_assurance_maladie"],
                requestPath: audit.requestPath ?? "/api/reception/walk-in-bookings",
                session,
                throwOnError: true,
            });
            await recordWriteOperationAuditEvent({
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
        return result;
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
            const patient = await Patient.findOne(
                { _id: patientId, archivedAt: null },
                { _id: 1, nom: 1, prenom: 1, num_assurance_maladie: 1, healthInsuranceJurisdiction: 1, ownerUserId: 1 }
            ).lean();
            if (!patient) {
                throw invalidInput("Patient introuvable.");
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
                { session, patientFromTransaction: patient }
            );

            await recordWriteOperationAuditEvent({
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
        return result;
    } finally {
        await session.endSession();
    }
}
