import mongoose from "mongoose";
import { Clinique } from "../models/Clinique.js";

/* ------------------------------------------------------------------ */
/* Clinique Service                                                   */
/* ------------------------------------------------------------------ */

export async function createClinique(dto) {
    if (!dto.nom || !dto.num_civique || !dto.rue || !dto.code_postal) {
        throw {
            code: "INVALID_INPUT",
            message:
                "Les champs 'nom', 'num_civique', 'rue' et 'code_postal' sont requis.",
        };
    }

    return Clinique.create(dto);
}

export async function listCliniques(filters = {}, opts = {}) {
    const query = {};

    if (filters.nom) {
        query.nom = { $regex: filters.nom, $options: "i" };
    }

    if (filters.rue) {
        query.rue = { $regex: filters.rue, $options: "i" };
    }
    if (filters.code_postal) {
        query.code_postal = {
            $regex: filters.code_postal,
            $options: "i",
        };
    }

    const page = Math.max(parseInt(opts.page) || 1, 1);
    const limit = Math.min(parseInt(opts.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
        Clinique.find(query)
            .sort({ nom: 1, rue: 1, num_civique: 1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Clinique.countDocuments(query),
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

export async function getCliniqueById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant de clinique invalide.",
        };
    }

    const clinique = await Clinique.findById(id).lean();

    if (!clinique) {
        throw {
            code: "NOT_FOUND",
            message: "Clinique introuvable.",
        };
    }

    return clinique;
}

export async function updateClinique(id, updates) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant de clinique invalide.",
        };
    }

    if (
        updates.nom === "" ||
        updates.num_civique === "" ||
        updates.rue === "" ||
        updates.code_postal === ""
    ) {
        throw {
            code: "INVALID_INPUT",
            message:
                "Les champs 'nom', 'num_civique', 'rue' et 'code_postal' ne peuvent pas être vides.",
        };
    }

    const clinique = await Clinique.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true }
    );

    if (!clinique) {
        throw {
            code: "NOT_FOUND",
            message: "Clinique introuvable.",
        };
    }

    return clinique;
}

export async function deleteClinique(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw {
            code: "INVALID_ID",
            message: "Identifiant de clinique invalide.",
        };
    }

    const deleted = await Clinique.findByIdAndDelete(id);

    if (!deleted) {
        throw {
            code: "NOT_FOUND",
            message: "Clinique introuvable.",
        };
    }

    return deleted;
}
