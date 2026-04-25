import mongoose from "mongoose";
import { UiTranslationCache } from "../models/UiTranslationCache.js";
import { recordAuthAuditEvent } from "../audit/authAudit.js";
import { notifyUiTranslationCacheChanged } from "./uiTranslationCacheRuntime.js";

function createTranslationAdminError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function assertSuperAdmin(authUser) {
    if (authUser?.role !== "SUPERADMIN") {
        throw createTranslationAdminError(
            "FORBIDDEN",
            "Action reservee au SUPERADMIN."
        );
    }
}

function normalizeLimit(value) {
    const parsed = Number.parseInt(String(value || "20"), 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return 20;
    }
    return Math.min(parsed, 100);
}

function normalizePage(value) {
    const parsed = Number.parseInt(String(value || "1"), 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return 1;
    }
    return parsed;
}

function normalizeOptionalString(value, maxLength = 120) {
    if (typeof value !== "string") {
        return "";
    }
    return value.trim().slice(0, maxLength);
}

function normalizePayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createTranslationAdminError(
            "INVALID_INPUT",
            "payload doit etre un objet JSON."
        );
    }

    return payload;
}

function mapTranslation(doc) {
    return {
        id: String(doc._id),
        namespace: doc.namespace,
        sourceLocale: doc.sourceLocale,
        targetLang: doc.targetLang,
        sourceHash: doc.sourceHash,
        sourceText: doc.sourceText || "",
        payload: doc.payload,
        voiceAck: doc.voiceAck || "",
        voicePrompts: doc.voicePrompts || {},
        model: doc.model || "unknown",
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}

export async function listUiTranslations({
    authUser,
    page,
    limit,
    namespace,
    targetLang,
    sourceLocale,
    search,
}) {
    assertSuperAdmin(authUser);

    const query = {};
    const normalizedNamespace = normalizeOptionalString(namespace, 80);
    const normalizedTargetLang = normalizeOptionalString(targetLang, 20).toLowerCase();
    const normalizedSourceLocale = normalizeOptionalString(sourceLocale, 20).toLowerCase();
    const normalizedSearch = normalizeOptionalString(search, 120);

    if (normalizedNamespace) {
        query.namespace = normalizedNamespace;
    }

    if (normalizedTargetLang) {
        query.targetLang = normalizedTargetLang;
    }

    if (normalizedSourceLocale) {
        query.sourceLocale = normalizedSourceLocale;
    }

    if (normalizedSearch) {
        const safePattern = normalizedSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
            { sourceText: { $regex: safePattern, $options: "i" } },
            { sourceHash: { $regex: safePattern, $options: "i" } },
        ];
    }

    const normalizedPage = normalizePage(page);
    const normalizedLimit = normalizeLimit(limit);
    const skip = (normalizedPage - 1) * normalizedLimit;

    const [total, docs] = await Promise.all([
        UiTranslationCache.countDocuments(query),
        UiTranslationCache.find(query)
            .sort({ updatedAt: -1, createdAt: -1 })
            .skip(skip)
            .limit(normalizedLimit)
            .lean(),
    ]);

    return {
        translations: docs.map(mapTranslation),
        pagination: {
            page: normalizedPage,
            limit: normalizedLimit,
            total,
            totalPages: Math.max(1, Math.ceil(total / normalizedLimit)),
        },
        filters: {
            namespace: normalizedNamespace,
            targetLang: normalizedTargetLang,
            sourceLocale: normalizedSourceLocale,
            search: normalizedSearch,
        },
    };
}

export async function updateUiTranslation({
    authUser,
    translationId,
    payload,
    sourceText,
    voiceAck,
    voicePrompts,
    req,
}) {
    assertSuperAdmin(authUser);

    if (!mongoose.Types.ObjectId.isValid(String(translationId))) {
        throw createTranslationAdminError(
            "INVALID_INPUT",
            "Identifiant de traduction invalide."
        );
    }

    const update = {
        payload: normalizePayload(payload),
        model: "manual",
    };

    if (typeof sourceText === "string") {
        update.sourceText = sourceText.trim().slice(0, 2000);
    }

    if (typeof voiceAck === "string") {
        update.voiceAck = voiceAck.trim().slice(0, 500);
    }

    if (voicePrompts && typeof voicePrompts === "object" && !Array.isArray(voicePrompts)) {
        update.voicePrompts = voicePrompts;
    }

    const doc = await UiTranslationCache.findByIdAndUpdate(
        translationId,
        { $set: update },
        { new: true }
    ).lean();

    if (!doc) {
        throw createTranslationAdminError(
            "NOT_FOUND",
            "Traduction introuvable."
        );
    }

    await recordAuthAuditEvent({
        action: "USER_MANAGEMENT",
        outcome: "SUCCESS",
        userId: authUser.userId,
        username: authUser.username,
        role: authUser.role,
        ip: req?.ip || null,
        reason: "TRANSLATION_CACHE_UPDATE",
    });

    notifyUiTranslationCacheChanged({
        namespace: doc.namespace,
        targetLang: doc.targetLang,
        sourceHash: doc.sourceHash,
    });

    return {
        translation: mapTranslation(doc),
    };
}

export async function deleteUiTranslation({ authUser, translationId, req }) {
    assertSuperAdmin(authUser);

    if (!mongoose.Types.ObjectId.isValid(String(translationId))) {
        throw createTranslationAdminError(
            "INVALID_INPUT",
            "Identifiant de traduction invalide."
        );
    }

    const doc = await UiTranslationCache.findByIdAndDelete(translationId).lean();
    if (!doc) {
        throw createTranslationAdminError(
            "NOT_FOUND",
            "Traduction introuvable."
        );
    }

    await recordAuthAuditEvent({
        action: "USER_MANAGEMENT",
        outcome: "SUCCESS",
        userId: authUser.userId,
        username: authUser.username,
        role: authUser.role,
        ip: req?.ip || null,
        reason: "TRANSLATION_CACHE_DELETE",
    });

    notifyUiTranslationCacheChanged({
        namespace: doc.namespace,
        targetLang: doc.targetLang,
        sourceHash: doc.sourceHash,
    });

    return {
        success: true,
        translation: mapTranslation(doc),
    };
}
