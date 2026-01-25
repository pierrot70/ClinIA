import mongoose from "mongoose";
import { Patient } from "../models/Patient.js";

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

    const page = Math.max(parseInt(opts.page) || 1, 1);
    const limit = Math.min(parseInt(opts.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
        Patient.find(query)
            .sort({ nom: 1, prenom: 1 })
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
