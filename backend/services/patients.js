import mongoose from "mongoose";
import { Patient } from "../models/Patient.js";
import { geocodeFreeAddress } from "../utils/geocode.js";

/* ------------------------------------------------------------------ */
/* Service Patient                                                     */
/* ------------------------------------------------------------------ */

function randomDigits(length) {
    let out = "";
    for (let i = 0; i < length; i++) {
        out += Math.floor(Math.random() * 10).toString();
    }
    return out;
}

function generateRamqNumber() {
    return `RAMQ${randomDigits(10)}`;
}

async function ensureUniqueRamqNumber() {
    for (let i = 0; i < 5; i++) {
        const candidate = generateRamqNumber();
        const existing = await Patient.findOne({
            num_assurance_maladie: candidate,
        }).lean();
        if (!existing) return candidate;
    }

    throw {
        code: "RAMQ_GENERATION_FAILED",
        message:
            "Impossible de générer un numéro RAMQ unique.",
    };
}

export async function createPatient(dto) {
    if (!dto.nom || !dto.prenom) {
        throw {
            code: "INVALID_INPUT",
            message: "Les champs 'nom' et 'prenom' sont requis.",
        };
    }

    if (!dto.num_assurance_maladie) {
        dto.num_assurance_maladie =
            await ensureUniqueRamqNumber();
    }

    if (
        dto.addresse &&
        (dto.lat === undefined || dto.long === undefined)
    ) {
        const coords = await geocodeFreeAddress(dto.addresse);
        if (coords) {
            if (dto.lat === undefined) dto.lat = coords.lat;
            if (dto.long === undefined) dto.long = coords.long;
        }
    }

    return Patient.create(dto);
}

export async function listPatients(filters = {}, opts = {}) {
    const query = {};

    if (filters.nom) {
        query.nom = { $regex: filters.nom, $options: "i" };
    }
    if (filters.prenom) {
        query.prenom = { $regex: filters.prenom, $options: "i" };
    }
    if (filters.num_assurance_maladie) {
        query.num_assurance_maladie = {
            $regex: filters.num_assurance_maladie,
            $options: "i",
        };
    }
    if (filters.telephone) {
        query.telephone = {
            $regex: filters.telephone,
            $options: "i",
        };
    }
    if (filters.addresse) {
        query.addresse = {
            $regex: filters.addresse,
            $options: "i",
        };
    }

    const page = Math.max(parseInt(opts.page) || 1, 1);
    const limit = Math.min(parseInt(opts.limit) || 10, 50);
    const skip = (page - 1) * limit;
    const allowedSorts = new Set([
        "nom",
        "prenom",
        "addresse",
        "telephone",
        "num_assurance_maladie",
    ]);
    const sortBy = allowedSorts.has(opts.sortBy)
        ? opts.sortBy
        : "nom";
    const sortDir = opts.sortDir === "desc" ? -1 : 1;
    const sort =
        sortBy === "prenom"
            ? { prenom: sortDir, nom: 1 }
            : { [sortBy]: sortDir, prenom: 1 };

    const [data, total] = await Promise.all([
        Patient.find(query)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean(),
        Patient.countDocuments(query),
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

export async function getPatientById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant patient invalide.",
        };
    }

    const patient = await Patient.findById(id).lean();

    if (!patient) {
        throw {
            code: "NOT_FOUND",
            message: "Patient introuvable.",
        };
    }

    return patient;
}

export async function updatePatient(id, updates) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant patient invalide.",
        };
    }

    const existing = await Patient.findById(id).lean();
    if (!existing) {
        throw {
            code: "NOT_FOUND",
            message: "Patient introuvable.",
        };
    }

    if (
        updates.num_assurance_maladie === "" ||
        updates.nom === "" ||
        updates.prenom === ""
    ) {
        throw {
            code: "INVALID_INPUT",
            message:
                "Les champs 'nom', 'prenom' et 'num_assurance_maladie' ne peuvent pas être vides.",
        };
    }

    if (
        (updates.lat === undefined || updates.long === undefined) &&
        (updates.addresse ?? existing.addresse)
    ) {
        const coords = await geocodeFreeAddress(
            updates.addresse ?? existing.addresse
        );
        if (coords) {
            if (updates.lat === undefined) updates.lat = coords.lat;
            if (updates.long === undefined) updates.long = coords.long;
        }
    }

    const patient = await Patient.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true }
    );

    if (!patient) {
        throw {
            code: "NOT_FOUND",
            message: "Patient introuvable.",
        };
    }

    return patient;
}

export async function deletePatient(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant patient invalide.",
        };
    }

    const deleted = await Patient.findByIdAndDelete(id);

    if (!deleted) {
        throw {
            code: "NOT_FOUND",
            message: "Patient introuvable.",
        };
    }

    return deleted;
}
