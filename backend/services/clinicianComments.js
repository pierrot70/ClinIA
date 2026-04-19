import { ClinicianComment } from "../models/ClinicianComment.js";
import { obfuscateClinicianComment } from "../utils/clinicianCommentPrivacy.js";

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

function createClinicianCommentError(code, message) {
    return { code, message };
}

function assertCommentAccess(authUser) {
    if (!authUser) {
        return;
    }

    if (!["USER", "MEDECIN", "ADMIN", "SUPERADMIN"].includes(authUser.role)) {
        throw createClinicianCommentError(
            "FORBIDDEN",
            "Action reservee aux usagers authentifies."
        );
    }
}

function assertAdminAccess(authUser) {
    if (!authUser?.role || !["ADMIN", "SUPERADMIN"].includes(authUser.role)) {
        throw createClinicianCommentError(
            "FORBIDDEN",
            "Action reservee aux administrateurs."
        );
    }
}

function normalizePageLimit(limit) {
    const parsed = Number.parseInt(`${limit || DEFAULT_PAGE_LIMIT}`, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw createClinicianCommentError(
            "INVALID_INPUT",
            "Limite invalide."
        );
    }

    return Math.min(parsed, MAX_PAGE_LIMIT);
}

function normalizePage(page) {
    const parsed = Number.parseInt(`${page || 1}`, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw createClinicianCommentError("INVALID_INPUT", "Page invalide.");
    }

    return parsed;
}

function normalizeScope(scope) {
    const normalized = String(scope || "own").trim().toLowerCase();
    if (!["own", "all"].includes(normalized)) {
        throw createClinicianCommentError("INVALID_INPUT", "Scope invalide.");
    }

    return normalized;
}

function normalizeComment(entry) {
    return {
        id: String(entry._id),
        actorUserId: String(entry.actorUserId),
        actorUsername: entry.actorUsername,
        actorRole: entry.actorRole,
        comment: entry.comment,
        redactionCount: Number(entry.redactionCount || 0),
        redactionTypes: Array.isArray(entry.redactionTypes) ? entry.redactionTypes : [],
        createdAt: entry.createdAt,
    };
}

export async function createClinicianComment({ authUser, comment, guestDisplayName }) {
    assertCommentAccess(authUser);

    const trimmedComment = String(comment || "").trim();
    if (!trimmedComment) {
        throw createClinicianCommentError(
            "INVALID_INPUT",
            "Le commentaire est requis."
        );
    }

    if (trimmedComment.length > 4000) {
        throw createClinicianCommentError(
            "INVALID_INPUT",
            "Le commentaire est trop long."
        );
    }

    const obfuscated = obfuscateClinicianComment(trimmedComment);

    const actorUsername = authUser?.username
        ? String(authUser.username).trim().toLowerCase()
        : null;

    const normalizedGuestDisplayName = actorUsername
        ? null
        : String(guestDisplayName || "").trim().toLowerCase();

    const resolvedUsername = actorUsername || normalizedGuestDisplayName;
    if (!resolvedUsername) {
        throw createClinicianCommentError(
            "INVALID_INPUT",
            "Le nom d'usager ou pseudonyme est requis."
        );
    }

    if (resolvedUsername.length < 3 || resolvedUsername.length > 120) {
        throw createClinicianCommentError(
            "INVALID_INPUT",
            "Le nom d'usager ou pseudonyme est invalide."
        );
    }

    const created = await ClinicianComment.create({
        actorUserId: authUser?.userId || null,
        actorUsername: resolvedUsername,
        actorRole: authUser?.role || "ANONYMOUS",
        comment: obfuscated.sanitized,
        redactionCount: obfuscated.redactionCount,
        redactionTypes: obfuscated.redactionTypes,
    });

    return normalizeComment(created.toObject());
}

export async function listClinicianComments({
    authUser,
    page,
    limit,
    scope,
}) {
    if (!authUser) {
        throw createClinicianCommentError(
            "FORBIDDEN",
            "Authentification requise pour consulter les commentaires."
        );
    }

    assertCommentAccess(authUser);

    const normalizedPage = normalizePage(page);
    const normalizedLimit = normalizePageLimit(limit);
    const normalizedScope = normalizeScope(scope);
    const query = {};

    if (normalizedScope === "all") {
        assertAdminAccess(authUser);
    } else {
        query.actorUserId = authUser.userId;
    }

    const skip = (normalizedPage - 1) * normalizedLimit;

    const [items, total] = await Promise.all([
        ClinicianComment.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(normalizedLimit)
            .lean(),
        ClinicianComment.countDocuments(query),
    ]);

    return {
        items: items.map(normalizeComment),
        pagination: {
            page: normalizedPage,
            limit: normalizedLimit,
            total,
            totalPages: Math.max(1, Math.ceil(total / normalizedLimit)),
        },
        scope: normalizedScope,
    };
}
