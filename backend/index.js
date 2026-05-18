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
import {
    VOICE_PROMPTS_SOURCE_FR,
    buildVoiceAck,
    buildVoicePrompts,
    hasVoicePromptsShape,
} from "./services/voicePromptsService.js";
import { createTranslationCacheService } from "./services/translationCacheService.js";
import { createHomeTranslationService } from "./services/homeTranslationService.js";

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

const {
    translationMemoryCache,
    translationInFlightLocks,
    makeTranslationCacheKey,
    isUntranslatedPayload,
    cacheTranslationInMemory,
} = createTranslationCacheService({
    buildVoiceAck,
    buildVoicePrompts,
    hasVoicePromptsShape,
});

async function warmTranslationMemoryCache() {
    return homeTranslationService.warmTranslationMemoryCache();
}

const respondWithSecurityIncident = createRespondWithSecurityIncident({
    createSecurityIncident,
    recordOpenAIRequestAuditEvent,
    buildBlockingIncidentResponse,
    makeSourceHash,
});

const homeTranslationService = createHomeTranslationService({
    UiTranslationCache,
    openai,
    makeSourceHash,
    supportsJsonResponseFormat,
    hasHomeI18nShape,
    VOICE_PROMPTS_SOURCE_FR,
    buildVoiceAck,
    buildVoicePrompts,
    hasVoicePromptsShape,
    translationMemoryCache,
    translationInFlightLocks,
    makeTranslationCacheKey,
    isUntranslatedPayload,
    cacheTranslationInMemory,
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

app.post("/api/i18n/home-translate", homeTranslationService.handleHomeTranslate);

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
