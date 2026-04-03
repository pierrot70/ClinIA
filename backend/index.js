import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import crypto from "crypto";
import OpenAI from "openai";

import { safeParseMedicalAI } from "./utils/aiParser.js";
import { getMockForDiagnosis } from "./utils/mockLoader.js";
import { DiagnosisResult } from "./models/DiagnosisResult.js";
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

import appointmentsRouter from "./routes/appointments.js";
import patientsRouter from "./routes/patients.js";
import cliniquesRouter from "./routes/cliniques.js";
import specialistsRouter from "./routes/specialists.js";
import securityIncidentsRouter from "./routes/securityIncidents.js";
import authRouter from "./routes/auth.js";
import translationRouter from "./routes/translation.js";

import { verifyJWT } from "./middleware/verifyJWT.js";
import { requireRole } from "./middleware/requireRole.js";
import { AUTH_ROLES } from "./auth/constants.js";
import { initShutdownState } from "./services/appShutdown.js";
import { clinicalDemoRateLimiter } from "./middleware/clinicalDemoRateLimiter.js";
import { loi25DataLeakGuard } from "./middleware/loi25DataLeakGuard.js";

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
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=()");

    const isProd = process.env.NODE_ENV === "production";
    const forwardedProto = req.headers["x-forwarded-proto"];
    const hostHeader = String(req.headers.host || "").toLowerCase();
    const hostname = hostHeader.split(":")[0];
    const isLocalHostRequest =
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1";
    const isSecure =
        req.secure ||
        (typeof forwardedProto === "string" &&
            forwardedProto.toLowerCase().includes("https"));

    if (isProd && !isSecure && !isLocalHostRequest) {
        return res.status(400).json({
            error: {
                code: "HTTPS_REQUIRED",
                message: "HTTPS est requis.",
                retryable: false,
            },
        });
    }

    if (isSecure) {
        res.setHeader(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains"
        );
    }

    return next();
});

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

const JSON_MODELS = new Set([
    "gpt-4.1-mini",
    "gpt-4.1",
    "gpt-4o-mini",
]);

function supportsJsonResponseFormat(model = "") {
    return JSON_MODELS.has(model);
}

function normalizeClinicalAnalysis(raw) {
    // Fusionne tous les champs de patient_analysis ET de la racine
    const pa = raw?.patient_analysis ?? {};
    const root = { ...raw };
    delete root.patient_analysis;

    // On fusionne pa et root (root écrase pa en cas de doublon, mais pa est prioritaire pour les champs standards)
    const merged = { ...root, ...pa };

    const treatments = Array.isArray(merged.treatments)
        ? merged.treatments.map((t) => ({
            name: t?.name ?? "Traitement non spécifié",
            indication: t?.indication ?? "",
            dosage: t?.dosage ?? "",
            duration: t?.duration ?? "",
            contraindications: Array.isArray(t?.contraindications)
                ? t.contraindications
                : [],
            monitoring: Array.isArray(t?.monitoring)
                ? t.monitoring
                : [],
            evidence_level: t?.evidence_level ?? "C",
        }))
        : [];

    // Champs standards
    const base = {
        diagnosis: {
            suspected:
                merged.diagnosis?.suspected ??
                "Analyse clinique en cours",
            certainty_level:
                merged.diagnosis?.certainty_level ?? "moderate",
            justification:
                merged.diagnosis?.justification ??
                "Analyse basée sur données cliniques disponibles.",
        },
        treatments,
        alternatives: Array.isArray(merged.alternatives)
            ? merged.alternatives
            : [],
        red_flags: Array.isArray(merged.red_flags)
            ? merged.red_flags
            : [],
        patient_summary: {
            plain_language:
                merged.patient_summary?.plain_language ??
                "Résumé patient généré par ClinIA.",
            clinical_language:
                merged.patient_summary?.clinical_language ??
                "Analyse clinique structurée.",
        },
        meta: {
            model: process.env.OPENAI_MODEL ?? "fallback",
            confidence_score:
                typeof merged.confidence_score === "number"
                    ? merged.confidence_score
                    : 0.6,
        },
    };

    // Champs IA avancés dynamiques (hors standards)
    const standardKeys = new Set([
        "diagnosis",
        "treatments",
        "alternatives",
        "red_flags",
        "patient_summary",
        "meta",
    ]);

    // On ajoute explicitement les champs connus IA avancés
    const knownAIFields = [
        "clinical_summary",
        "recommendations",
        "initial_evaluation_recommendations",
        "treatment_options",
        "follow_up_and_monitoring",
        "supportive_care",
        "follow_up_and_supportive_care",
    ];
    // Toujours inclure tous les champs IA avancés présents dans merged
    for (const key of knownAIFields) {
        if (Object.prototype.hasOwnProperty.call(merged, key)) {
            base[key] = merged[key];
        }
    }

    // On regroupe tous les autres champs IA non standards dans 'other_ai_fields'
    const otherAIFields = {};
    for (const [key, value] of Object.entries(merged)) {
        if (!standardKeys.has(key) && !knownAIFields.includes(key) && value !== undefined) {
            otherAIFields[key] = value;
        }
    }
    if (Object.keys(otherAIFields).length > 0) {
        base.other_ai_fields = otherAIFields;
    }

    // Ajout d'un log pour debug
    console.log("[normalizeClinicalAnalysis] merged:", JSON.stringify(merged, null, 2));
    console.log("[normalizeClinicalAnalysis] base:", JSON.stringify(base, null, 2));

    return base;
}

function hasHomeI18nShape(obj) {
    return (
        obj &&
        typeof obj === "object" &&
        obj.home &&
        obj.search &&
        obj.options
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

async function persistOrReuseDiagnosis(payload) {
    try {
        const created = await DiagnosisResult.create(payload);
        return { ok: true, doc: created };
    } catch (err) {
        if (err.code === 11000) {
            const existing = await DiagnosisResult.findOne({
                fingerprint: payload.fingerprint,
            }).lean();
            if (existing) return { ok: true, doc: existing };
        }

        console.error("❌ Mongo persist error:", err.message);
        return {
            ok: false,
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Analyse générée mais sauvegarde impossible.",
                retryable: false,
            },
        };
    }
}

async function respondWithSecurityIncident({
    res,
    phase,
    reason,
    requestPath,
    matches,
    context = {},
}) {
    try {
        const incident = await createSecurityIncident({
            phase,
            reason,
            requestPath,
            matches,
            context,
            transport: "openai_chat_completions",
        });

        return res.status(422).json(buildBlockingIncidentResponse(incident));
    } catch (err) {
        console.error("❌ Security incident persistence error:", err);

        return res.status(500).json({
            error: {
                code: "SECURITY_INCIDENT_LOG_FAILED",
                message:
                    "Contenu non securise detecte mais incident non enregistre. Workflow bloque: reessayez ou contactez l'administrateur.",
                retryable: true,
            },
            blocking: {
                required: true,
                userMessage:
                    "L'incident de securite doit etre journalise avant de continuer.",
            },
        });
    }
}

/* ================================================================== */
/* /api/ai/analyze                                                    */
/* ================================================================== */

// Appliquer le rate limiter uniquement si l'utilisateur n'est pas authentifié (ex: clinical-demo)
app.post("/api/ai/analyze", (req, res, next) => {
    if (!req.user) {
        return clinicalDemoRateLimiter(req, res, next);
    }
    return next();
}, async (req, res) => {
    try {
        const safeBody = sanitizeRequestPayload(req.body ?? {});
        const promptInjectionScan = detectPromptInjection(safeBody);
        if (promptInjectionScan.hasMatch) {
            return res.status(400).json({
                error: {
                    code: "PROMPT_INJECTION_DETECTED",
                    message:
                        "La requete contient des instructions non autorisees.",
                    retryable: false,
                },
            });
        }

        const {
            symptoms = [],
            forceReal,
            openaiModel,
            incidentAckId,
        } = safeBody;

        if (!Array.isArray(symptoms) || symptoms.length === 0) {
            return res.json({
                error: {
                    code: "INVALID_INPUT",
                    message:
                        "Données cliniques insuffisantes pour l’analyse.",
                    retryable: false,
                },
            });
        }

        const diagnosisSeed = Array.isArray(symptoms)
            ? symptoms.join(" ")
            : "";
        const diagnosis =
            typeof req.body?.diagnosis === "string" &&
            req.body.diagnosis.trim()
                ? req.body.diagnosis.trim()
                : diagnosisSeed || "To be determined by ClinIA";
        const patient = safeBody;
        let neutralizationMeta = null;
        const fingerprint = makeFingerprint({ diagnosis, patient });

        const isProd =
            process.env.NODE_ENV === "production" ||
            process.env.CLINIA_FORCE_MOCK === "true";
        const forceRealSafe = !isProd && forceReal === true;
        if (isProd && forceReal === true) {
            console.warn("⚠️ forceReal ignored in production");
        }
        const useMock =
            (process.env.CLINIA_MOCK_AI === "true" || isProd) &&
            !forceRealSafe;

        const model =
            openaiModel || process.env.OPENAI_MODEL;

        console.log("AI_REQUEST from Frontend", {
            model,
            forceReal: forceRealSafe,
            useMock,
            circuitOpen: !canCallOpenAI(),
            symptomCount: Array.isArray(symptoms)
                ? symptoms.length
                : 0,
            isProd,
        });

        const preCloudScan = detectNonSecureContent(patient);
        if (preCloudScan.hasMatches) {
            const ackedIncident = incidentAckId
                ? await getAcknowledgedSecurityIncident(incidentAckId)
                : null;

            if (!ackedIncident) {
                return respondWithSecurityIncident({
                    res,
                    phase: "pre_cloud",
                    reason:
                        "Non-secure patient identifiers detected before cloud transmission.",
                    requestPath: "/api/ai/analyze",
                    matches: preCloudScan.matches,
                    context: {
                        model,
                        direction: "request",
                    },
                });
            }

            const sanitizedPatient = sanitizeNonSecureContent(patient);
            neutralizationMeta = {
                neutralized: true,
                acknowledgmentIncidentId: String(ackedIncident._id),
                originalMatches: preCloudScan.matches,
                message:
                    "Requete contenant des donnees sensibles neutralisee apres acknowledgment explicite du clinicien.",
            };

            // Replace unsafe payload with sanitized payload for cloud call.
            Object.assign(patient, sanitizedPatient);
        }

        /* ---------------- MOCK ---------------- */
        if (useMock) {
            const mock = getMockForDiagnosis(diagnosisSeed || diagnosis);
            const analysis = normalizeClinicalAnalysis(mock);

            const persist = await persistOrReuseDiagnosis({
                fingerprint,
                input: patient,
                output: analysis,
                mode: "mock",
                model: "mock",
            });

            if (!persist.ok)
                return res.json({ error: persist.error });

            return res.json({
                data: persist.doc.output,
                meta: {
                    source: "mock",
                    model: "mock",
                    ...neutralizationMeta,
                },
            });
        }

        /* ---------------- CIRCUIT BREAKER ---------------- */
        if (!canCallOpenAI() && !forceRealSafe) {
            const degraded = normalizeClinicalAnalysis({});
            return res.json({
                data: degraded,
                meta: {
                    source: "degraded",
                    model: "fallback",
                    ...neutralizationMeta,
                },
            });
        }

        /* ---------------- OPENAI ---------------- */
        const baseRequest = {
            model,
            messages: [
                {
                    role: "system",
                    content:
                        "You are ClinIA, a clinical decision support AI. ONLY provide therapeutic options, recommendations, and clinical summary for the specific cancer diagnosis provided by the user (e.g., stomach cancer). Ignore all other diagnoses and comorbidities. Return valid JSON only.",
                },
                {
                    role: "user",
                    content:
                        `The patient has a specific cancer diagnosis: ${diagnosis}. ONLY provide evidence-based treatment options, recommendations, and clinical summary for this specific cancer (e.g., stomach cancer). Do NOT mention or propose treatments for hypertension or any other diagnosis.\nFull patient data: ${JSON.stringify(patient)}`,
                },
            ],
            temperature: 0.1,
        };

        const request = supportsJsonResponseFormat(model)
            ? {
                ...baseRequest,
                response_format: { type: "json_object" },
            }
            : baseRequest;

        let normalized;
        let rawContent = "";

        try {
            const completion =
                await openai.chat.completions.create(
                    request
                );

            rawContent =
                completion?.choices?.[0]?.message?.content || "";

            // Ajout : log de la réponse brute OpenAI
            console.log("=== RAW OpenAI RESPONSE ===\n", rawContent, "\n===========================");

            const postCloudScan = detectNonSecureContent(rawContent);
            if (postCloudScan.hasMatches) {
                return respondWithSecurityIncident({
                    res,
                    phase: "post_cloud",
                    reason:
                        "Non-secure patient identifiers detected after cloud transmission.",
                    requestPath: "/api/ai/analyze",
                    matches: postCloudScan.matches,
                    context: {
                        model,
                        direction: "response",
                    },
                });
            }

            const parsed = safeParseMedicalAI(
                rawContent
            );

            normalized = normalizeClinicalAnalysis(parsed);
            recordOpenAISuccess();
        } catch (err) {
            console.error("❌ OpenAI error:", err.message);
            recordOpenAIFailure();

            return res.status(502).json({
                error: {
                    code: "OPENAI_UPSTREAM_FAILED",
                    message:
                        "Le service OpenAI est indisponible. Corrigez le contenu ou reessayez plus tard.",
                    retryable: true,
                },
            });
        }

        const persist = await persistOrReuseDiagnosis({
            fingerprint,
            input: patient,
            output: normalized,
            mode: "real",
            model: model ?? "unknown",
        });

        console.log("AI_RESPONSE From OpenAI", {
            model,
            source: "real",
            hasDiagnosis: Boolean(normalized?.diagnosis?.suspected),
        });

        if (!persist.ok)
            return res.status(500).json({ error: persist.error });

            // Log explicite de la réponse envoyée au frontend
            const responsePayload = {
                data: persist.doc.output,
                meta: {
                    source: "real",
                    model,
                    ...neutralizationMeta,
                },
            };
            console.log("=== RESPONSE TO FRONTEND ===\n", JSON.stringify(responsePayload, null, 2), "\n============================");
            return res.json(responsePayload);
    } catch (err) {
        console.error("🔥 FATAL /api/ai/analyze ERROR", err);
        return res.status(500).json({
            error: {
                code: "INTERNAL_ERROR",
                message:
                    "Erreur interne du service ClinIA.",
                retryable: true,
            },
        });
    }
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
            if (isUntranslatedPayload(target, inMemory.payload, sourceStrings)) {
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
                if (isUntranslatedPayload(target, cached.payload, sourceStrings)) {
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

/*
    Dans ce block j'ajoute mes API endpoints
 */
app.use("/api/auth", authRouter);

app.use(
    "/api/appointments",
    verifyJWT,
    requireRole(
        AUTH_ROLES.USER,
        AUTH_ROLES.MEDECIN,
        AUTH_ROLES.ADMIN,
        AUTH_ROLES.SUPERADMIN
    ),
    loi25DataLeakGuard,
    appointmentsRouter
);
app.use(
    "/api/patients",
    verifyJWT,
    requireRole(
        AUTH_ROLES.USER,
        AUTH_ROLES.MEDECIN,
        AUTH_ROLES.ADMIN,
        AUTH_ROLES.SUPERADMIN
    ),
    loi25DataLeakGuard,
    patientsRouter
);
app.use(
    "/api/cliniques",
    verifyJWT,
    requireRole(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPERADMIN),
    loi25DataLeakGuard,
    cliniquesRouter
);
app.use(
    "/api/specialists",
    verifyJWT,
    requireRole(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPERADMIN),
    loi25DataLeakGuard,
    specialistsRouter
);
app.use(
    "/api/security/incidents",
    verifyJWT,
    requireRole(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPERADMIN),
    loi25DataLeakGuard,
    securityIncidentsRouter
);
app.use(
    "/api/auth",
    loi25DataLeakGuard,
    authRouter
);
app.use("/api/translation", translationRouter);

app.listen(4000, () =>
    console.log(
        "🚀 ClinIA backend ready on http://localhost:4000"
    )
);
