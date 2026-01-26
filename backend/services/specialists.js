import mongoose from "mongoose";
import { Specialist } from "../models/Specialist.js";

/* ------------------------------------------------------------------ */
/* Specialist Service                                                  */
/* ------------------------------------------------------------------ */

export async function createSpecialist(dto) {
    if (!dto.nom || !dto.prenom || !dto.numero_medecin) {
        throw {
            code: "INVALID_INPUT",
            message:
                "Les champs 'nom', 'prenom' et 'numero_medecin' sont requis.",
        };
    }

    return Specialist.create(dto);
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
            query.clinique_associer = filters.clinique_associer;
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

    const specialist = await Specialist.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true }
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

    const deleted = await Specialist.findByIdAndDelete(id);

    if (!deleted) {
        throw {
            code: "NOT_FOUND",
            message: "Spécialiste introuvable.",
        };
    }

    return deleted;
}
