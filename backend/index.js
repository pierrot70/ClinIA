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

import appointmentsRouter from "./routes/appointments.js";
import patientsRouter from "./routes/patients.js";
import cliniquesRouter from "./routes/cliniques.js";
import specialistsRouter from "./routes/specialists.js";
import securityIncidentsRouter from "./routes/securityIncidents.js";

dotenv.config();

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
app.use(cors());
app.use(express.json());

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
    const pa = raw?.patient_analysis ?? raw ?? {};

    const treatments = Array.isArray(pa.treatments)
        ? pa.treatments.map((t) => ({
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

    return {
        diagnosis: {
            suspected:
                pa.diagnosis?.suspected ??
                "Analyse clinique en cours",
            certainty_level:
                pa.diagnosis?.certainty_level ?? "moderate",
            justification:
                pa.diagnosis?.justification ??
                "Analyse basée sur données cliniques disponibles.",
        },
        treatments,
        alternatives: Array.isArray(pa.alternatives)
            ? pa.alternatives
            : [],
        red_flags: Array.isArray(pa.red_flags)
            ? pa.red_flags
            : [],
        patient_summary: {
            plain_language:
                pa.patient_summary?.plain_language ??
                "Résumé patient généré par ClinIA.",
            clinical_language:
                pa.patient_summary?.clinical_language ??
                "Analyse clinique structurée.",
        },
        meta: {
            model: process.env.OPENAI_MODEL ?? "fallback",
            confidence_score:
                typeof pa.confidence_score === "number"
                    ? pa.confidence_score
                    : 0.6,
        },
    };
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

app.post("/api/ai/analyze", async (req, res) => {
    try {
        const { symptoms = [], forceReal, openaiModel, incidentAckId } = req.body;

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
        const patient = req.body;
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
            symptoms,
            isProd,
        });

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
                meta: { source: "mock", model: "mock" },
            });
        }

        /* ---------------- CIRCUIT BREAKER ---------------- */
        if (!canCallOpenAI() && !forceRealSafe) {
            const degraded = normalizeClinicalAnalysis({});
            return res.json({
                data: degraded,
                meta: { source: "degraded", model: "fallback" },
            });
        }

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

        /* ---------------- OPENAI ---------------- */
        const baseRequest = {
            model,
            messages: [
                {
                    role: "system",
                    content:
                        "You are ClinIA. Return valid JSON only.",
                },
                {
                    role: "user",
                    content: JSON.stringify(patient),
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

        console.log("AI_RESPONSE From OpenAI", normalized);

        if (!persist.ok)
            return res.status(500).json({ error: persist.error });

        return res.json({
            data: persist.doc.output,
            meta: {
                source: "real",
                model,
                ...neutralizationMeta,
            },
        });
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
    })
    .catch((err) => {
        console.error("❌ Mongo connection error (FAIL-FAST):", err.message);
    });

/*
    Dans ce block j'ajoute mes API endpoints
 */
app.use("/api/appointments", appointmentsRouter);
app.use("/api/patients", patientsRouter);
app.use("/api/cliniques", cliniquesRouter);
app.use("/api/specialists", specialistsRouter);
app.use("/api/security/incidents", securityIncidentsRouter);

app.listen(4000, () =>
    console.log(
        "🚀 ClinIA backend ready on http://localhost:4000"
    )
);
