import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import crypto from "crypto";
import OpenAI from "openai";

import { safeParseMedicalAI } from "./utils/aiParser.js";
import {
    extractPrimaryClinicalConcern,
    isPlaceholderClinicalAnalysis,
    normalizeClinicalAnalysis,
} from "./utils/clinicalAnalysis.js";
import { getMockForDiagnosis } from "./utils/mockLoader.js";
import { UiTranslationCache } from "./models/UiTranslationCache.js";
import {
    buildBlockingIncidentResponse,
    detectNonSecureContent,
    sanitizeNonSecureContent,
} from "./utils/securityIncident.js";
import {
    createSecurityIncident,
    getAcknowledgedSecurityIncident,
} from "./services/securityIncidents.js";

import {
    canCallOpenAI,
    recordOpenAISuccess,
    recordOpenAIFailure,
} from "./utils/openaiCircuitBreaker.js";
import {
    detectPromptInjection,
    sanitizeRequestPayload,
} from "./utils/requestSafety.js";

import { initShutdownState } from "./services/appShutdown.js";
import {
    createOpenAILogsExportMassDownloadDetector,
    createPatientsMassDownloadDetector,
} from "./middleware/massDownloadDetector.js";
import { enforceMassDownloadRestriction } from "./middleware/enforceMassDownloadRestriction.js";
import { loi25DataLeakGuard } from "./middleware/loi25DataLeakGuard.js";
import {
    finalizeOpenAIRequestAuditEvent,
    recordOpenAIRequestAuditEvent,
} from "./audit/openaiRequestAudit.js";
import { configureCoreMiddleware } from "./app/configureCoreMiddleware.js";
import { registerRoutes } from "./app/registerRoutes.js";
import { createAiAnalyzeRouter } from "./routes/aiAnalyze.js";
import { createRespondWithSecurityIncident } from "./services/aiSecurityResponseService.js";
import {
    findPersistedDiagnosisByFingerprint,
    persistOrReuseDiagnosis,
    upgradePersistedDiagnosisOutput,
} from "./services/diagnosisPersistence.js";

dotenv.config();

// Log explicite de la valeur CLINIA_MOCK_AI au tout début du backend
console.log("[BOOT] CLINIA_MOCK_AI (raw env):", process.env.CLINIA_MOCK_AI);

mongoose.set("bufferCommands", false);

/* ------------------------------------------------------------------ */
/* Process safety (ANTI-CRASH)                                         */
/* ------------------------------------------------------------------ */

process.on("unhandledRejection", (reason) => {
    console.error("🔥 UNHANDLED PROMISE REJECTION", reason);
});

process.on("uncaughtException", (err) => {
    console.error("🔥 UNCAUGHT EXCEPTION", err);
});

/* ------------------------------------------------------------------ */
/* App init                                                           */
/* ------------------------------------------------------------------ */

const app = express();
const patientsMassDownloadDetector = createPatientsMassDownloadDetector();
const openAILogsExportMassDownloadDetector =
    createOpenAILogsExportMassDownloadDetector();
const massDownloadRestrictionGuard = enforceMassDownloadRestriction();
configureCoreMiddleware(app);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeFingerprint({ diagnosis, patient }) {
    return crypto
        .createHash("sha256")
        .update(JSON.stringify({ diagnosis, patient }))
        .digest("hex");
}

function makeSourceHash(sourceStrings) {
    return crypto
        .createHash("sha256")
        .update(JSON.stringify(sourceStrings))
        .digest("hex");
}

function getRequestIp(req) {
    const forwardedFor = req.headers?.["x-forwarded-for"];

    if (typeof forwardedFor === "string" && forwardedFor.trim()) {
        return forwardedFor.split(",")[0].trim();
    }

    return req.ip || null;
}

const JSON_MODELS = new Set([
    "gpt-4.1-mini",
    "gpt-4.1",
    "gpt-4o-mini",
]);

function supportsJsonResponseFormat(model = "") {
    return JSON_MODELS.has(model);
}

function hasHomeI18nShape(obj) {
    const requiredOptionKeys = [
        "objectives",
        "clinicalScopes",
        "ageGroups",
        "symptomProfiles",
        "durations",
        "severityLevels",
        "redFlagStatuses",
        "comorbidityContexts",
    ];

    const hasStringArray = (value) =>
        Array.isArray(value) && value.every((entry) => typeof entry === "string");

    return (
        obj &&
        typeof obj === "object" &&
        obj.home &&
        obj.search &&
        obj.options &&
        requiredOptionKeys.every((key) => hasStringArray(obj.options[key]))
    );
}

const VOICE_PROMPTS_SOURCE_FR = {
    dictationInstruction: "Dites ou ecrivez votre diagnostic.",
};

const DICTATION_PROMPT_BY_LANG = {
    fr: "Dites ou ecrivez votre diagnostic.",
    en: "Please dictate or type your diagnosis.",
    es: "Por favor, dicte o escriba su diagnostico.",
    de: "Bitte diktieren oder schreiben Sie Ihre Diagnose.",
    it: "Per favore, detti o scriva la sua diagnosi.",
    pt: "Por favor, dite ou escreva seu diagnostico.",
    ja: "Shindan o onsei de nyuryoku suru ka, nyuryoku shite kudasai.",
    ko: "Jindaneul malhagena ibryeokhae juseyo.",
    zh: "Qing koushu huo shuru nin de zhenduan.",
};

function buildVoicePrompts(langCode) {
    const normalized = String(langCode || "fr")
        .trim()
        .toLowerCase()
        .slice(0, 2);

    return {
        dictationInstruction:
            DICTATION_PROMPT_BY_LANG[normalized] ||
            DICTATION_PROMPT_BY_LANG.en,
    };
}

function hasVoicePromptsShape(obj) {
    return (
        obj &&
        typeof obj === "object" &&
        typeof obj.dictationInstruction === "string" &&
        obj.dictationInstruction.trim().length > 0
    );
}

const VOICE_ACK_LABELS = {
    en: "english",
    es: "spanish",
    de: "german",
    it: "italian",
    pt: "portuguese",
    ja: "japanese",
    ko: "korean",
    zh: "chinese",
    ar: "arabic",
    ru: "russian",
    hi: "hindi",
    tr: "turkish",
    nl: "dutch",
    sv: "swedish",
    no: "norwegian",
    da: "danish",
    fi: "finnish",
    pl: "polish",
    cs: "czech",
    ro: "romanian",
    el: "greek",
    he: "hebrew",
    id: "indonesian",
    vi: "vietnamese",
    th: "thai",
};

function buildVoiceAck(langCode) {
    const normalized = String(langCode || "fr")
        .trim()
        .toLowerCase()
        .slice(0, 2);

    if (normalized === "fr") {
        return "Retour en francais.";
    }

    const label = VOICE_ACK_LABELS[normalized] || normalized;
    return `Back in ${label}.`;
}

const translationMemoryCache = new Map();
const translationInFlightLocks = new Map();

function makeTranslationCacheKey({ namespace, targetLang, sourceHash }) {
    return `${namespace}::${targetLang}::${sourceHash}`;
}

function buildTranslationCacheEntry({
    payload,
    model,
    targetLang,
    voiceAck,
    voicePrompts,
}) {
    return {
        payload,
        model: model || "cache",
        targetLang,
        voiceAck: voiceAck || buildVoiceAck(targetLang),
        voicePrompts: hasVoicePromptsShape(voicePrompts)
            ? voicePrompts
            : buildVoicePrompts(targetLang),
    };
}

function isUntranslatedPayload(targetLang, payload, sourceStrings) {
    if (!payload || !sourceStrings) {
        return false;
    }

    const normalizedTarget = String(targetLang || "").toLowerCase().slice(0, 2);
    if (normalizedTarget === "fr") {
        return false;
    }

    try {
        return JSON.stringify(payload) === JSON.stringify(sourceStrings);
    } catch (e) {
        return false;
    }
}

function cacheTranslationInMemory({
    namespace,
    sourceHash,
    targetLang,
    payload,
    model,
    voiceAck,
    voicePrompts,
}) {
    const key = makeTranslationCacheKey({
        namespace,
        targetLang,
        sourceHash,
    });

    translationMemoryCache.set(
        key,
        buildTranslationCacheEntry({
            payload,
            model,
            targetLang,
            voiceAck,
            voicePrompts,
        })
    );
}

async function warmTranslationMemoryCache() {
    const docs = await UiTranslationCache.find({
        namespace: "home",
    }).lean();

    let warmed = 0;
    for (const doc of docs) {
        if (!doc?.sourceHash || !doc?.targetLang || !doc?.payload) {
            continue;
        }

        cacheTranslationInMemory({
            namespace: doc.namespace || "home",
            sourceHash: doc.sourceHash,
            targetLang: doc.targetLang,
            payload: doc.payload,
            model: doc.model,
            voiceAck: doc.voiceAck,
            voicePrompts: doc.voicePrompts,
        });
        warmed += 1;
    }

    console.log(`[i18n] memory cache warmed with ${warmed} entries`);
}

const respondWithSecurityIncident = createRespondWithSecurityIncident({
    createSecurityIncident,
    recordOpenAIRequestAuditEvent,
    buildBlockingIncidentResponse,
    makeSourceHash,
});

const aiAnalyzeRouter = createAiAnalyzeRouter({
    openai,
    sanitizeRequestPayload,
    detectPromptInjection,
    extractPrimaryClinicalConcern,
    detectNonSecureContent,
    getAcknowledgedSecurityIncident,
    respondWithSecurityIncident,
    getRequestIp,
    makeSourceHash,
    makeFingerprint,
    findPersistedDiagnosisByFingerprint,
    upgradePersistedDiagnosisOutput,
    normalizeClinicalAnalysis,
    isPlaceholderClinicalAnalysis,
    getMockForDiagnosis,
    persistOrReuseDiagnosis,
    canCallOpenAI,
    supportsJsonResponseFormat,
    recordOpenAIRequestAuditEvent,
    finalizeOpenAIRequestAuditEvent,
    safeParseMedicalAI,
    recordOpenAISuccess,
    recordOpenAIFailure,
    sanitizeNonSecureContent,
});

/* ================================================================== */
/* /api/i18n/home-translate                                           */
/* ================================================================== */

app.post("/api/i18n/home-translate", async (req, res) => {
    try {
        const { targetLang, sourceStrings } = req.body ?? {};
        const namespace = "home";

        const target =
            typeof targetLang === "string"
                ? targetLang.trim().toLowerCase()
                : "";

        if (!/^[a-z]{2}(?:-[a-z]{2})?$/.test(target)) {
            return res.status(400).json({
                error: {
                    code: "INVALID_INPUT",
                    message:
                        "targetLang must be an ISO language code like 'en', 'fr', 'ja', 'de' or 'zh'.",
                    retryable: false,
                },
            });
        }

        if (!hasHomeI18nShape(sourceStrings)) {
            return res.status(400).json({
                error: {
                    code: "INVALID_INPUT",
                    message: "sourceStrings has an invalid shape.",
                    retryable: false,
                },
            });
        }

        if (target === "fr") {
            return res.json({
                data: sourceStrings,
                meta: {
                    source: "passthrough",
                    lang: "fr",
                    voiceAck: buildVoiceAck("fr"),
                    voicePrompts: buildVoicePrompts("fr"),
                },
            });
        }

        const sourceHash = makeSourceHash(sourceStrings);
        const memoryKey = makeTranslationCacheKey({
            namespace,
            targetLang: target,
            sourceHash,
        });

        const inMemory = translationMemoryCache.get(memoryKey);
        if (inMemory?.payload) {
            if (!hasHomeI18nShape(inMemory.payload)) {
                translationMemoryCache.delete(memoryKey);
                console.warn("⚠️ I18N invalid memory cache invalidated", {
                    namespace,
                    target,
                    sourceHash,
                });
            } else if (isUntranslatedPayload(target, inMemory.payload, sourceStrings)) {
                translationMemoryCache.delete(memoryKey);
                console.warn("⚠️ I18N stale memory cache invalidated", {
                    namespace,
                    target,
                    sourceHash,
                });
            } else {
            console.log("I18N_MEMORY_HIT", {
                namespace,
                target,
                sourceHash,
            });
            return res.json({
                data: inMemory.payload,
                meta: {
                    source: "memory",
                    lang: target,
                    model: inMemory.model || "memory-cache",
                    voiceAck:
                        inMemory.voiceAck ||
                        buildVoiceAck(target),
                    voicePrompts: hasVoicePromptsShape(inMemory.voicePrompts)
                        ? inMemory.voicePrompts
                        : buildVoicePrompts(target),
                },
            });
            }
        }

        try {
            const cached = await UiTranslationCache.findOne({
                namespace,
                targetLang: target,
                sourceHash,
            }).lean();

            if (cached?.payload) {
                if (!hasHomeI18nShape(cached.payload)) {
                    console.warn("⚠️ I18N invalid DB cache invalidated", {
                        namespace,
                        target,
                        sourceHash,
                    });
                    await UiTranslationCache.deleteOne({ _id: cached._id });
                } else if (isUntranslatedPayload(target, cached.payload, sourceStrings)) {
                    console.warn("⚠️ I18N stale DB cache invalidated", {
                        namespace,
                        target,
                        sourceHash,
                    });
                    await UiTranslationCache.deleteOne({ _id: cached._id });
                } else {
                const cachedVoicePrompts = hasVoicePromptsShape(cached.voicePrompts)
                    ? cached.voicePrompts
                    : buildVoicePrompts(target);

                const cachedVoiceAck =
                    cached.voiceAck ||
                    buildVoiceAck(target);

                if (!hasVoicePromptsShape(cached.voicePrompts)) {
                    UiTranslationCache.updateOne(
                        { _id: cached._id },
                        { $set: { voicePrompts: cachedVoicePrompts } }
                    ).catch((err) => {
                        console.warn("⚠️ I18N cache backfill failed", err?.message);
                    });
                }

                console.log("I18N_CACHE_HIT", {
                    namespace,
                    target,
                    sourceHash,
                });

                cacheTranslationInMemory({
                    namespace,
                    sourceHash,
                    targetLang: target,
                    payload: cached.payload,
                    model: cached.model ?? "cache",
                    voiceAck: cachedVoiceAck,
                    voicePrompts: cachedVoicePrompts,
                });

                return res.json({
                    data: cached.payload,
                    meta: {
                        source: "cache",
                        lang: target,
                        model: cached.model ?? "cache",
                        voiceAck: cachedVoiceAck,
                        voicePrompts: cachedVoicePrompts,
                    },
                });
                }
            }
        } catch (cacheReadErr) {
            console.warn("⚠️ I18N cache read failed", cacheReadErr?.message);
        }

        console.log("I18N_CACHE_MISS", {
            namespace,
            target,
            sourceHash,
        });

        const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
        const systemPrompt =
            "You are a UI localization engine for a medical assistant application. " +
            "Translate only values to target language while preserving JSON structure, keys, arrays, punctuation and placeholders. " +
            "Do not add medical claims. Return valid JSON only.";

        const userPrompt = {
            task: "Translate this UI string bundle",
            targetLang: target,
            constraints: [
                "Preserve JSON keys exactly",
                "Keep arrays lengths and order",
                "Return voicePrompts with the same keys",
                "Output strictly valid JSON object",
            ],
            sourceStrings,
            voicePrompts: VOICE_PROMPTS_SOURCE_FR,
        };

        const baseRequest = {
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: JSON.stringify(userPrompt) },
            ],
            temperature: 0.1,
        };

        const request = supportsJsonResponseFormat(model)
            ? {
                ...baseRequest,
                response_format: { type: "json_object" },
            }
            : baseRequest;

        const inFlight = translationInFlightLocks.get(memoryKey);
        if (inFlight) {
            console.log("I18N_LOCK_WAIT", {
                namespace,
                target,
                sourceHash,
            });
            const sharedResult = await inFlight;
            return res.json({
                data: sharedResult.payload,
                meta: {
                    source: "lock",
                    model: sharedResult.model,
                    lang: target,
                    voiceAck: sharedResult.voiceAck,
                    voicePrompts: sharedResult.voicePrompts,
                },
            });
        }

        const translatePromise = (async () => {
            const completion = await openai.chat.completions.create(request);
            const content = completion?.choices?.[0]?.message?.content ?? "{}";

            let translated;
            try {
                translated = JSON.parse(content);
            } catch (e) {
                const error = new Error("UPSTREAM_INVALID_JSON");
                error.code = "UPSTREAM_INVALID_JSON";
                throw error;
            }

            if (!hasHomeI18nShape(translated)) {
                const error = new Error("UPSTREAM_INVALID_SHAPE");
                error.code = "UPSTREAM_INVALID_SHAPE";
                throw error;
            }

            if (isUntranslatedPayload(target, translated, sourceStrings)) {
                const error = new Error("UPSTREAM_UNTRANSLATED");
                error.code = "UPSTREAM_UNTRANSLATED";
                throw error;
            }

            const translatedVoicePrompts = hasVoicePromptsShape(translated.voicePrompts)
                ? translated.voicePrompts
                : buildVoicePrompts(target);
            const voiceAck = buildVoiceAck(target);

            try {
                await UiTranslationCache.create({
                    namespace,
                    sourceLocale: "fr",
                    targetLang: target,
                    sourceHash,
                    payload: translated,
                    voiceAck,
                    voicePrompts: translatedVoicePrompts,
                    model,
                });
            } catch (cacheWriteErr) {
                if (cacheWriteErr?.code === 11000) {
                    // Another concurrent request wrote it first; harmless.
                } else {
                    console.warn("⚠️ I18N cache write failed", cacheWriteErr?.message);
                }
            }

            cacheTranslationInMemory({
                namespace,
                sourceHash,
                targetLang: target,
                payload: translated,
                model,
                voiceAck,
                voicePrompts: translatedVoicePrompts,
            });

            return {
                payload: translated,
                model,
                voiceAck,
                voicePrompts: translatedVoicePrompts,
            };
        })();

        translationInFlightLocks.set(memoryKey, translatePromise);
        try {
            const translatedResult = await translatePromise;
            return res.json({
                data: translatedResult.payload,
                meta: {
                    source: "openai",
                    model: translatedResult.model,
                    lang: target,
                    voiceAck: translatedResult.voiceAck,
                    voicePrompts: translatedResult.voicePrompts,
                },
            });
        } catch (upstreamErr) {
            if (upstreamErr?.code === "UPSTREAM_INVALID_JSON") {
                return res.status(502).json({
                    error: {
                        code: "UPSTREAM_INVALID_JSON",
                        message: "OpenAI returned invalid JSON for translation.",
                        retryable: true,
                    },
                });
            }

            if (upstreamErr?.code === "UPSTREAM_INVALID_SHAPE") {
                return res.status(502).json({
                    error: {
                        code: "UPSTREAM_INVALID_SHAPE",
                        message: "Translated payload has invalid shape.",
                        retryable: true,
                    },
                });
            }

            if (upstreamErr?.code === "UPSTREAM_UNTRANSLATED") {
                return res.status(502).json({
                    error: {
                        code: "UPSTREAM_UNTRANSLATED",
                        message: "Translation result was identical to source language.",
                        retryable: true,
                    },
                });
            }

            throw upstreamErr;
        } finally {
            if (translationInFlightLocks.get(memoryKey) === translatePromise) {
                translationInFlightLocks.delete(memoryKey);
            }
        }
    } catch (err) {
        console.error("🔥 /api/i18n/home-translate ERROR", err);
        return res.status(500).json({
            error: {
                code: "INTERNAL_ERROR",
                message: "Translation service failed.",
                retryable: true,
            },
        });
    }
});

/* ------------------------------------------------------------------ */
/* Mongo / Server                                                     */
/* ------------------------------------------------------------------ */

mongoose
    .connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 2000, // ⏱️ max 2 secondes si Mongo est down
    })
    .then(async () => {
        console.log("✅ MongoDB connecté (ClinIA)");
        console.log(
            "CLINIA_MOCK_AI =",
            process.env.CLINIA_MOCK_AI
        );
        console.log(
            "OPENAI_MODEL =",
            process.env.OPENAI_MODEL
        );

        try {
            await warmTranslationMemoryCache();
        } catch (err) {
            console.warn("⚠️ I18N warmup failed", err?.message);
        }

        try {
            await initShutdownState();
            console.log("✅ Maintenance state chargé depuis MongoDB");
        } catch (err) {
            console.warn("⚠️ initShutdownState failed", err?.message);
        }
    })
    .catch((err) => {
        console.error("❌ Mongo connection error (FAIL-FAST):", err.message);
    });

registerRoutes(app, {
    massDownloadRestrictionGuard,
    patientsMassDownloadDetector,
    openAILogsExportMassDownloadDetector,
    aiAnalyzeRouter,
});

app.use((err, _req, res, next) => {
    if (err?.code === "CORS_ORIGIN_DENIED") {
        return res.status(403).json({
            error: {
                code: "CORS_ORIGIN_DENIED",
                message: "Origine CORS non autorisee.",
                retryable: false,
            },
        });
    }

    return next(err);
});

app.listen(4000, () =>
    console.log(
        "🚀 ClinIA backend ready on http://localhost:4000"
    )
);
