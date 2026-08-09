import mongoose from "mongoose";
import { AppointmentCoordinationRequest } from "../models/AppointmentCoordinationRequest.js";
import { Patient } from "../models/Patient.js";
import { AdminUser } from "../models/AdminUser.js";
import { Specialist } from "../models/Specialist.js";
import { Clinique } from "../models/Clinique.js";
import { CLINICAL_WRITE_CONCERN } from "../db/clinicalWriteConcern.js";
import {
    getAvailableSlotSchedule,
} from "./appointments.js";

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;
const REQUEST_STATUSES = new Set([
    "open",
    "ready_to_schedule",
    "resolved",
    "cancelled",
]);

function coordinationError(code, message) {
    return { code, message };
}

function assertCoordinationAccess(authUser) {
    if (!authUser?.role || !["ADMIN", "SUPERADMIN"].includes(authUser.role)) {
        throw coordinationError("FORBIDDEN", "Action réservée aux administrateurs.");
    }
}

function parsePagination(page, limit) {
    const parsedPage = Number.parseInt(page, 10) || 1;
    const parsedLimit = Number.parseInt(limit, 10) || DEFAULT_PAGE_LIMIT;
    if (parsedPage < 1 || parsedLimit < 1 || parsedLimit > MAX_PAGE_LIMIT) {
        throw coordinationError("INVALID_INPUT", "Pagination invalide.");
    }
    return { page: parsedPage, limit: parsedLimit };
}

function normalizeStatus(status) {
    if (status == null || status === "") return null;
    if (typeof status !== "string" || !REQUEST_STATUSES.has(status.trim())) {
        throw coordinationError("INVALID_INPUT", "Statut de demande invalide.");
    }
    return status.trim();
}

function toIdMap(rows = []) {
    return new Map(rows.map((row) => [String(row._id), row]));
}

function serializeRequest(
    request,
    patientsById,
    usersById,
    { includePatientIdentity }
) {
    const patient = patientsById.get(String(request.patient));
    const requestedBy = usersById.get(String(request.requestedByUserId));

    return {
        id: String(request._id),
        specialty: request.specialty,
        status: request.status,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
        availabilityVerifiedAt: request.availabilityVerifiedAt || null,
        resolvedAppointment: request.resolvedAppointment
            ? String(request.resolvedAppointment)
            : null,
        resolvedAt: request.resolvedAt || null,
        patient: includePatientIdentity && patient
            ? {
                anonymized: false,
                id: String(patient._id),
                nom: patient.nom,
                prenom: patient.prenom,
            }
            : includePatientIdentity
                ? null
                : { anonymized: true },
        requestedBy: requestedBy
            ? { id: String(requestedBy._id), username: requestedBy.username }
            : null,
    };
}

export async function listCoordinationRequests({ authUser, page, limit, status }) {
    assertCoordinationAccess(authUser);
    const includePatientIdentity = authUser.role === "SUPERADMIN";
    const pagination = parsePagination(page, limit);
    const normalizedStatus = normalizeStatus(status);
    const query = normalizedStatus ? { status: normalizedStatus } : {};
    const skip = (pagination.page - 1) * pagination.limit;

    const [total, requests] = await Promise.all([
        AppointmentCoordinationRequest.countDocuments(query),
        AppointmentCoordinationRequest.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(pagination.limit)
            .lean(),
    ]);

    const patientIds = [...new Set(requests.map((request) => String(request.patient)))];
    const requesterIds = [
        ...new Set(requests.map((request) => String(request.requestedByUserId))),
    ];
    const [patients, users] = await Promise.all([
        includePatientIdentity && patientIds.length
            ? Patient.find({ _id: { $in: patientIds } }, { nom: 1, prenom: 1 }).lean()
            : [],
        requesterIds.length
            ? AdminUser.find({ _id: { $in: requesterIds } }, { username: 1 }).lean()
            : [],
    ]);
    const totalPages = Math.max(1, Math.ceil(total / pagination.limit));

    const patientsById = toIdMap(patients);
    const usersById = toIdMap(users);

    return {
        requests: requests.map((request) =>
            serializeRequest(request, patientsById, usersById, {
                includePatientIdentity,
            })
        ),
        pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total,
            totalPages,
        },
    };
}

function localDateKey(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate()
    ).padStart(2, "0")}`;
}

function getPracticeLocations(specialist) {
    if (Array.isArray(specialist?.practiceLocations) && specialist.practiceLocations.length) {
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

async function findEarliestAvailabilityForRequest(request) {
    const specialists = await Specialist.find({
        specialite: request.specialty,
        clinique_associer: { $ne: null },
    }).lean();
    const specialistLocations = specialists.flatMap((specialist) =>
        getPracticeLocations(specialist).map((location) => ({
            specialist,
            ...location,
        }))
    );
    if (specialistLocations.length === 0) {
        throw coordinationError(
            "NO_SPECIALISTS_FOR_SPECIALTY",
            "Aucun spécialiste associé à une clinique n'est disponible pour cette spécialité."
        );
    }

    const clinicIds = [
        ...new Set(specialistLocations.map((location) => location.clinique)),
    ];
    const clinics = await Clinique.find({ _id: { $in: clinicIds } }).lean();
    const clinicsById = toIdMap(clinics);
    let earliest = null;

    for (const candidateLocation of specialistLocations) {
        const { specialist, clinique, disponibilites } = candidateLocation;
        const clinic = clinicsById.get(clinique);
        if (!clinic || !Array.isArray(disponibilites)) continue;

        const futureDates = [...new Set(
            disponibilites
                .filter((slot) => new Date(slot).getTime() > Date.now())
                .map(localDateKey)
                .filter(Boolean)
        )].sort();

        for (const date of futureDates) {
            const schedule = await getAvailableSlotSchedule(
                String(specialist._id),
                date,
                { patient: String(request.patient), clinique }
            );
            const time = schedule.slots[0];
            if (!time) continue;

            const candidate = { specialist, clinic, date, time };
            if (
                !earliest ||
                `${candidate.date}T${candidate.time}` <
                    `${earliest.date}T${earliest.time}`
            ) {
                earliest = candidate;
            }
        }
    }

    if (!earliest) {
        throw coordinationError(
            "NO_AVAILABLE_SLOTS_FOR_SPECIALTY",
            "Des spécialistes associés à une clinique existent, mais aucun créneau futur n'est disponible."
        );
    }

    return {
        clinique: { id: String(earliest.clinic._id), nom: earliest.clinic.nom },
        specialist: {
            id: String(earliest.specialist._id),
            nom: earliest.specialist.nom,
            prenom: earliest.specialist.prenom,
        },
        date: earliest.date,
        time: earliest.time,
    };
}

export async function verifyCoordinationRequestAvailability({ requestId, authUser }) {
    assertCoordinationAccess(authUser);
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        throw coordinationError("INVALID_INPUT", "Identifiant de demande invalide.");
    }

    const existing = await AppointmentCoordinationRequest.findById(requestId).lean();
    if (!existing) {
        throw coordinationError("NOT_FOUND", "Demande de coordination introuvable.");
    }
    if (existing.status !== "open") {
        throw coordinationError(
            "INVALID_STATE",
            "Seule une demande ouverte peut être vérifiée."
        );
    }

    const availability = await findEarliestAvailabilityForRequest(existing);
    const request = await AppointmentCoordinationRequest.findOneAndUpdate(
        { _id: requestId, status: "open" },
        {
            $set: {
                status: "ready_to_schedule",
                availabilityVerifiedAt: new Date(),
            },
        },
        { new: true, ...CLINICAL_WRITE_CONCERN }
    ).lean();
    if (request) {
        return { request, availability };
    }
    throw coordinationError("INVALID_STATE", "Cette demande n'est plus ouverte.");
}
