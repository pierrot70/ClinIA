import { ClinicianComment } from "../models/ClinicianComment.js";
import {
    detectDirectContactInfo,
    obfuscateClinicianComment,
} from "../utils/clinicianCommentPrivacy.js";
import mongoose from "mongoose";
import crypto from "crypto";

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;
const MAX_COMMENT_LENGTH = 500;
const TRACKING_CODE_REGEX = /^[A-Z0-9]{8}$/;

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

function generateTrackingCode() {
    return crypto.randomBytes(6).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase();
}

function normalizeTrackingCode(value) {
    return String(value || "").trim().toUpperCase();
}

function validateTrackingCode(value) {
    if (!TRACKING_CODE_REGEX.test(value)) {
        throw createClinicianCommentError(
            "INVALID_INPUT",
            "Le code de suivi est invalide."
        );
    }
}

function hashTrackingCode(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeComment(entry) {
    return {
        id: String(entry._id),
        actorUserId: entry.actorUserId ? String(entry.actorUserId) : null,
        actorUsername: entry.actorUsername,
        actorRole: entry.actorRole,
        comment: entry.comment,
        redactionCount: Number(entry.redactionCount || 0),
        redactionTypes: Array.isArray(entry.redactionTypes) ? entry.redactionTypes : [],
        createdAt: entry.createdAt,
        replies: Array.isArray(entry.replies)
            ? entry.replies.map((reply) => ({
                id: String(reply._id),
                responderUserId: String(reply.responderUserId),
                responderUsername: reply.responderUsername,
                responderRole: reply.responderRole,
                message: reply.message,
                createdAt: reply.createdAt,
            }))
            : [],
    };
}

function normalizePublicReply(reply) {
    return {
        id: String(reply._id),
        responderUserId: String(reply.responderUserId),
        responderUsername: "Equipe ClinIA",
        responderRole: reply.responderRole,
        message: reply.message,
        createdAt: reply.createdAt,
    };
}

function normalizePublicComment(entry) {
    return {
        id: String(entry._id),
        actorUserId: entry.actorUserId ? String(entry.actorUserId) : null,
        actorUsername: entry.actorUsername,
        actorRole: entry.actorRole,
        comment: entry.comment,
        redactionCount: Number(entry.redactionCount || 0),
        redactionTypes: Array.isArray(entry.redactionTypes) ? entry.redactionTypes : [],
        createdAt: entry.createdAt,
        replies: Array.isArray(entry.replies)
            ? entry.replies.map(normalizePublicReply)
            : [],
    };
}

export async function createClinicianComment({
    authUser,
    comment,
    guestDisplayName,
    trackingCode,
}) {
    assertCommentAccess(authUser);

    const trimmedComment = String(comment || "").trim();
    if (!trimmedComment) {
        throw createClinicianCommentError(
            "INVALID_INPUT",
            "Le commentaire est requis."
        );
    }

    if (trimmedComment.length > MAX_COMMENT_LENGTH) {
        throw createClinicianCommentError(
            "INVALID_INPUT",
            "Le commentaire ne peut pas depasser 500 caracteres."
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

    const resolvedTrackingCode = normalizeTrackingCode(trackingCode) || generateTrackingCode();
    validateTrackingCode(resolvedTrackingCode);
    const trackingCodeHash = hashTrackingCode(resolvedTrackingCode);

    const created = await ClinicianComment.create({
        actorUserId: authUser?.userId || null,
        actorUsername: resolvedUsername,
        actorRole: authUser?.role || "ANONYMOUS",
        trackingCodeHash,
        comment: obfuscated.sanitized,
        redactionCount: obfuscated.redactionCount,
        redactionTypes: obfuscated.redactionTypes,
    });

    return {
        ...normalizeComment(created.toObject()),
        trackingCode: resolvedTrackingCode,
    };
}

export async function listClinicianComments({
    authUser,
    page,
    limit,
    scope,
    actorUsername,
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
    const actorUsernameFilter = String(actorUsername || "").trim().toLowerCase();

    if (normalizedScope === "all") {
        assertAdminAccess(authUser);
    } else {
        query.actorUserId = authUser.userId;
    }

    if (actorUsernameFilter) {
        query.actorUsername = actorUsernameFilter;
    }

    const skip = (normalizedPage - 1) * normalizedLimit;
    const usernamesQuery = { ...query };
    delete usernamesQuery.actorUsername;

    const [items, total, availableActorUsernames] = await Promise.all([
        ClinicianComment.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(normalizedLimit)
            .lean(),
        ClinicianComment.countDocuments(query),
        ClinicianComment.distinct("actorUsername", usernamesQuery),
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
        availableActorUsernames: availableActorUsernames
            .map((entry) => String(entry || "").trim())
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, "fr")),
    };
}

export async function replyToClinicianComment({
    authUser,
    commentId,
    message,
}) {
    assertAdminAccess(authUser);

    const normalizedCommentId = String(commentId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(normalizedCommentId)) {
        throw createClinicianCommentError(
            "INVALID_INPUT",
            "Identifiant de commentaire invalide."
        );
    }

    const trimmedMessage = String(message || "").trim();
    if (!trimmedMessage) {
        throw createClinicianCommentError(
            "INVALID_INPUT",
            "La reponse est requise."
        );
    }

    if (trimmedMessage.length > 4000) {
        throw createClinicianCommentError(
            "INVALID_INPUT",
            "La reponse est trop longue."
        );
    }

    const directContactTypes = detectDirectContactInfo(trimmedMessage);
    if (directContactTypes.length > 0) {
        throw createClinicianCommentError(
            "REPLY_CONTACT_INFO_BLOCKED",
            "La reponse ne peut pas contenir d'adresse courriel, de numero de telephone ou de lien direct."
        );
    }

    const obfuscated = obfuscateClinicianComment(trimmedMessage);

    const updated = await ClinicianComment.findByIdAndUpdate(
        normalizedCommentId,
        {
            $push: {
                replies: {
                    responderUserId: authUser.userId,
                    responderUsername: authUser.username,
                    responderRole: authUser.role,
                    message: obfuscated.sanitized,
                    createdAt: new Date(),
                },
            },
        },
        { new: true, lean: true }
    );

    if (!updated) {
        throw createClinicianCommentError(
            "INVALID_INPUT",
            "Commentaire introuvable."
        );
    }

    return normalizeComment(updated);
}

export async function lookupClinicianReplies({
    actorUsername,
    trackingCode,
}) {
    const normalizedActorUsername = String(actorUsername || "").trim().toLowerCase();
    if (!normalizedActorUsername) {
        throw createClinicianCommentError(
            "INVALID_INPUT",
            "Le nom ou pseudonyme est requis."
        );
    }

    const normalizedTrackingCode = normalizeTrackingCode(trackingCode);
    validateTrackingCode(normalizedTrackingCode);

    const items = await ClinicianComment.find({
        actorUsername: normalizedActorUsername,
        trackingCodeHash: hashTrackingCode(normalizedTrackingCode),
        "replies.0": { $exists: true },
    })
        .sort({ createdAt: -1 })
        .lean();

    return {
        actorUsername: normalizedActorUsername,
        items: items.map(normalizePublicComment),
    };
}
