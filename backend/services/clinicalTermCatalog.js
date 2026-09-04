import { ClinicalTermRequest } from "../models/ClinicalTermRequest.js";
import { getStaticApprovedClinicalTerms } from "../utils/requestSafety.js";

export function normalizeClinicalTerm(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z -]/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

export function validateRequestedClinicalTerm(value) {
    const term = String(value ?? "").trim().replace(/\s+/g, " ");
    const normalized = normalizeClinicalTerm(term);
    if (term.length < 2 || term.length > 80 || !normalized || normalized.length < 2) {
        return { valid: false, code: "INVALID_TERM" };
    }
    // A catalog item must be a concise concept, not a free-text clinical note.
    if (!/^[A-Za-zÀ-ÿ' -]+$/.test(term) || term.split(" ").length > 8) {
        return { valid: false, code: "INVALID_TERM" };
    }
    return { valid: true, term, normalized };
}

export async function listApprovedClinicalTerms() {
    const rows = await ClinicalTermRequest.find({ field: "symptoms", status: "APPROVED" })
        .select({ proposedTerm: 1 })
        .sort({ proposedTerm: 1 })
        .lean();
    const dynamicTerms = rows.map((row) => ({
        field: "symptoms",
        canonicalValue: row.proposedTerm,
        aliases: [row.proposedTerm],
    }));
    const byCanonicalValue = new Map();
    for (const term of [...getStaticApprovedClinicalTerms(), ...dynamicTerms]) {
        byCanonicalValue.set(normalizeClinicalTerm(term.canonicalValue), term);
    }
    return Array.from(byCanonicalValue.values()).sort((a, b) =>
        a.canonicalValue.localeCompare(b.canonicalValue, "en")
    );
}

export async function createClinicalTermRequest({ term, authUser }) {
    const checked = validateRequestedClinicalTerm(term);
    if (!checked.valid) {
        const error = new Error("Le terme doit être un concept clinique court, sans donnée patient.");
        error.code = checked.code;
        throw error;
    }
    const approved = await ClinicalTermRequest.findOne({
        field: "symptoms", normalizedTerm: checked.normalized, status: "APPROVED",
    }).lean();
    if (approved) {
        const error = new Error("Ce terme est déjà approuvé.");
        error.code = "TERM_ALREADY_APPROVED";
        throw error;
    }
    try {
        return await ClinicalTermRequest.create({
            field: "symptoms",
            proposedTerm: checked.term,
            normalizedTerm: checked.normalized,
            requestedByUserId: authUser.userId,
        });
    } catch (error) {
        if (error?.code === 11000) {
            const duplicate = new Error("Une demande pour ce terme est déjà en attente.");
            duplicate.code = "TERM_REQUEST_ALREADY_PENDING";
            throw duplicate;
        }
        throw error;
    }
}

export async function listPendingClinicalTermRequests() {
    return ClinicalTermRequest.find({ status: "PENDING" })
        .select({ proposedTerm: 1, field: 1, createdAt: 1 })
        .sort({ createdAt: 1 })
        .lean();
}

export async function decideClinicalTermRequest({ requestId, decision, authUser }) {
    if (!["APPROVED", "REJECTED"].includes(decision)) {
        const error = new Error("Décision invalide.");
        error.code = "INVALID_DECISION";
        throw error;
    }
    const request = await ClinicalTermRequest.findOneAndUpdate(
        { _id: requestId, status: "PENDING" },
        { $set: { status: decision, decidedByUserId: authUser.userId, decidedAt: new Date() } },
        { new: true }
    );
    if (!request) {
        const error = new Error("Demande introuvable ou déjà traitée.");
        error.code = "NOT_FOUND";
        throw error;
    }
    return request;
}
