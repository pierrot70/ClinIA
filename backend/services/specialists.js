import mongoose from "mongoose";
import { assertUrgentologistAvailability, isIps } from "../domain/specialties.js";
import { Specialist } from "../models/Specialist.js";
import { AdminUser } from "../models/AdminUser.js";
import { CLINICAL_QUERY_WRITE_OPTIONS, CLINICAL_WRITE_CONCERN } from "../db/clinicalWriteConcern.js";

/* ------------------------------------------------------------------ */
/* Specialist Service                                                  */
/* ------------------------------------------------------------------ */

function validateDisponibilites(disponibilites, allowedPastSlots = new Set(), now = Date.now()) {
    if (disponibilites === undefined) return;
    if (disponibilites === "__invalid__") {
        throw {
            code: "INVALID_INPUT",
            message:
                "Les disponibilités fournies sont invalides.",
        };
    }
    if (!Array.isArray(disponibilites)) {
        throw {
            code: "INVALID_INPUT",
            message:
                "Les disponibilités doivent être un tableau.",
        };
    }

    const normalized = disponibilites.map((slot) => {
        const date = slot instanceof Date ? slot : new Date(slot);
        if (Number.isNaN(date.getTime())) {
            throw {
                code: "INVALID_INPUT",
                message:
                    "Chaque disponibilité doit être une date ISO valide.",
            };
        }
        if (
            date.getUTCSeconds() !== 0 ||
            date.getUTCMilliseconds() !== 0 ||
            date.getUTCMinutes() % 15 !== 0
        ) {
            throw {
                code: "INVALID_INPUT",
                message:
                    "Chaque disponibilité doit être alignée sur 15 minutes.",
            };
        }
        return date;
    });

    const sorted = [...normalized].sort(
        (a, b) => a.getTime() - b.getTime()
    );

    // Retained history does not constrain the month being scheduled now.
    let monthKey = null;

    for (let i = 0; i < sorted.length; i += 1) {
        const current = sorted[i];
        const isRetainedPastSlot = current.getTime() < now &&
            allowedPastSlots.has(current.toISOString());
        if (current.getTime() < now && !isRetainedPastSlot) {
            throw {
                code: "INVALID_INPUT",
                message:
                    "Les disponibilités ne peuvent pas être dans le passé.",
            };
        }
        if (i > 0) {
            const prev = sorted[i - 1];
            if (current.getTime() === prev.getTime()) {
                throw {
                    code: "INVALID_INPUT",
                    message:
                        "Les disponibilités ne doivent pas se chevaucher.",
                };
            }
        }
        if (!isRetainedPastSlot) {
            const key = `${current.getUTCFullYear()}-${current.getUTCMonth()}`;
            if (monthKey !== null && key !== monthKey) {
                throw {
                    code: "INVALID_INPUT",
                    message:
                        "Les disponibilités doivent appartenir au même mois.",
                };
            }
            monthKey = key;
        }
    }
}

function validatePracticeLocations(practiceLocations, existingPastSlotsByClinic = new Map(), now = Date.now()) {
    if (practiceLocations === undefined) return;
    if (practiceLocations === "__invalid__" || !Array.isArray(practiceLocations)) {
        throw {
            code: "INVALID_INPUT",
            message: "Les lieux de pratique fournis sont invalides.",
        };
    }
    if (practiceLocations.length < 1 || practiceLocations.length > 2) {
        throw {
            code: "INVALID_INPUT",
            message: "Un spécialiste doit avoir une ou deux cliniques de pratique.",
        };
    }

    const clinicIds = new Set();
    const slotInstants = new Set();
    for (const location of practiceLocations) {
        if (!mongoose.Types.ObjectId.isValid(location?.clinique)) {
            throw {
                code: "INVALID_INPUT",
                message: "Clinique de pratique invalide.",
            };
        }
        const clinicId = String(location.clinique);
        if (clinicIds.has(clinicId)) {
            throw {
                code: "INVALID_INPUT",
                message: "Une clinique ne peut être ajoutée qu'une seule fois.",
            };
        }
        clinicIds.add(clinicId);
        const pastSlots = existingPastSlotsByClinic.get(clinicId);
        validateDisponibilites(location.disponibilites, pastSlots?.disponibilites, now);
        validateDisponibilites(location.walkInDisponibilites, pastSlots?.walkInDisponibilites, now);
        for (const slot of [
            ...(location.disponibilites || []),
            ...(location.walkInDisponibilites || []),
        ]) {
            const instant = new Date(slot).toISOString();
            if (slotInstants.has(instant)) {
                throw {
                    code: "INVALID_INPUT",
                    message: "Un spécialiste ne peut pas être disponible à deux cliniques au même créneau.",
                };
            }
            slotInstants.add(instant);
        }
    }
}

function getExistingPastSlotsByClinic(specialist, now = Date.now()) {
    const locations = Array.isArray(specialist?.practiceLocations) && specialist.practiceLocations.length
        ? specialist.practiceLocations
        : specialist?.clinique_associer
          ? [{
                clinique: specialist.clinique_associer,
                disponibilites: specialist.disponibilites || [],
                walkInDisponibilites: specialist.walkInDisponibilites || [],
            }]
          : [];
    const slotsByClinic = new Map();

    for (const location of locations) {
        const clinicId = String(location.clinique);
        const pastSlots = {};
        for (const field of ["disponibilites", "walkInDisponibilites"]) {
            pastSlots[field] = new Set();
            for (const slot of location[field] || []) {
                const date = new Date(slot);
                if (!Number.isNaN(date.getTime()) && date.getTime() < now) {
                    pastSlots[field].add(date.toISOString());
                }
            }
        }
        slotsByClinic.set(clinicId, pastSlots);
    }

    return slotsByClinic;
}

function applyPracticeLocationCompatibility(dto) {
    if (!dto.practiceLocations) return dto;

    const primary = dto.practiceLocations[0];
    return {
        ...dto,
        // Retained temporarily so older clients continue to receive a primary
        // clinic. Appointment scheduling reads practiceLocations instead.
        clinique_associer: primary.clinique,
        disponibilites: primary.disponibilites,
        walkInDisponibilites: primary.walkInDisponibilites || [],
    };
}

async function validateAccountUserLink(accountUserId, specialty) {
    if (accountUserId === undefined || accountUserId === null) return;
    if (
        accountUserId === "__invalid__" ||
        !mongoose.Types.ObjectId.isValid(accountUserId)
    ) {
        throw {
            code: "INVALID_INPUT",
            message: "Compte ClinIA associé invalide.",
        };
    }

    const clinicianAccount = await AdminUser.findOne({
        _id: accountUserId,
        role: isIps(specialty) ? "IPS" : "MEDECIN",
        isActive: true,
    }).lean();
    if (!clinicianAccount) {
        throw {
            code: "INVALID_INPUT",
            message: "Le compte ClinIA associé doit être actif et correspondre à la profession (IPS ou médecin).",
        };
    }
}

export async function listEligibleClinicianAccounts() {
    const users = await AdminUser.find({
        role: { $in: ["MEDECIN", "IPS"] },
        isActive: true,
    })
        .select("username email role")
        .sort({ username: 1 })
        .lean();

    return users.map((user) => ({
        id: String(user._id),
        username: user.username,
        email: user.email || null,
        role: user.role,
    }));
}

export async function createSpecialist(dto) {
    if (!dto.nom || !dto.prenom || !dto.numero_medecin) {
        throw {
            code: "INVALID_INPUT",
            message:
                "Les champs 'nom', 'prenom' et 'numero_medecin' sont requis.",
        };
    }

    validateDisponibilites(dto.disponibilites);
    validateDisponibilites(dto.walkInDisponibilites);
    validatePracticeLocations(dto.practiceLocations);
    assertUrgentologistAvailability(dto);
    await validateAccountUserLink(dto.accountUserId, dto.specialite);

    const specialistPayload = applyPracticeLocationCompatibility(dto);
    if (specialistPayload.accountUserId === null) {
        delete specialistPayload.accountUserId;
    }
    const specialist = new Specialist(specialistPayload);
    return specialist.save(CLINICAL_WRITE_CONCERN);
}

export async function listSpecialists(filters = {}, opts = {}) {
    const query = {};

    if (filters.nom) {
        query.nom = { $regex: filters.nom, $options: "i" };
    }
    if (filters.prenom) {
        query.prenom = { $regex: filters.prenom, $options: "i" };
    }
    if (filters.numero_medecin) {
        query.numero_medecin = {
            $regex: filters.numero_medecin,
            $options: "i",
        };
    }
    if (filters.telephone) {
        query.telephone = {
            $regex: filters.telephone,
            $options: "i",
        };
    }
    if (filters.email) {
        query.email = {
            $regex: filters.email,
            $options: "i",
        };
    }
    if (filters.clinique_associer) {
        if (mongoose.Types.ObjectId.isValid(filters.clinique_associer)) {
            query.$or = [
                { "practiceLocations.clinique": filters.clinique_associer },
                { clinique_associer: filters.clinique_associer },
            ];
        }
    }

    const page = Math.max(parseInt(opts.page) || 1, 1);
    const limit = Math.min(parseInt(opts.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
        Specialist.find(query)
            .sort({ nom: 1, prenom: 1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Specialist.countDocuments(query),
    ]);

    return {
        data,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

export async function getSpecialistById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant de spécialiste invalide.",
        };
    }

    const specialist = await Specialist.findById(id).lean();

    if (!specialist) {
        throw {
            code: "NOT_FOUND",
            message: "Spécialiste introuvable.",
        };
    }

    return specialist;
}

export async function updateSpecialist(id, updates) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant de spécialiste invalide.",
        };
    }

    if (
        updates.numero_medecin === "" ||
        updates.nom === "" ||
        updates.prenom === ""
    ) {
        throw {
            code: "INVALID_INPUT",
            message:
                "Les champs 'nom', 'prenom' et 'numero_medecin' ne peuvent pas être vides.",
        };
    }

    validateDisponibilites(updates.disponibilites);
    validateDisponibilites(updates.walkInDisponibilites);

    let existing = null;
    if (updates.practiceLocations !== undefined || updates.specialite !== undefined || updates.disponibilites !== undefined || updates.accountUserId !== undefined) {
        existing = await Specialist.findById(id).lean();
        if (!existing) {
            throw {
                code: "NOT_FOUND",
                message: "Spécialiste introuvable.",
            };
        }
    }
    if (updates.accountUserId !== undefined || updates.specialite !== undefined) {
        await validateAccountUserLink(
            updates.accountUserId === undefined ? existing?.accountUserId : updates.accountUserId,
            updates.specialite === undefined ? existing?.specialite : updates.specialite
        );
    }
    const availabilityValidationTime = Date.now();
    validatePracticeLocations(
        updates.practiceLocations,
        getExistingPastSlotsByClinic(existing, availabilityValidationTime),
        availabilityValidationTime
    );

    const compatibleUpdates = applyPracticeLocationCompatibility(updates);
    assertUrgentologistAvailability({ ...existing, ...compatibleUpdates });
    const unset = {};
    if (compatibleUpdates.accountUserId === null) {
        delete compatibleUpdates.accountUserId;
        unset.accountUserId = 1;
    }

    const specialist = await Specialist.findByIdAndUpdate(
        id,
        {
            ...(Object.keys(compatibleUpdates).length > 0
                ? { $set: compatibleUpdates }
                : {}),
            ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
        },
        {
            new: true,
            runValidators: true,
            ...CLINICAL_QUERY_WRITE_OPTIONS,
        }
    );

    if (!specialist) {
        throw {
            code: "NOT_FOUND",
            message: "Spécialiste introuvable.",
        };
    }

    return specialist;
}

export async function deleteSpecialist(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant de spécialiste invalide.",
        };
    }

    const deleted = await Specialist.findByIdAndDelete(
        id,
        CLINICAL_QUERY_WRITE_OPTIONS
    );

    if (!deleted) {
        throw {
            code: "NOT_FOUND",
            message: "Spécialiste introuvable.",
        };
    }

    return deleted;
}
