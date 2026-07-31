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
    assessCloudClinicalPayload,
    buildCloudSafePatientPayload,
    detectPromptInjection,
    sanitizeRequestPayload,
    validateAnalyzeRequestShape,
    validateClinicalInputBounds,
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
import { getTrustedRequestIp } from "./utils/requestIp.js";
import { registerErrorHandlers } from "./app/registerErrorHandlers.js";
import { registerRoutes } from "./app/registerRoutes.js";
import { createStartServer } from "./app/startServer.js";
import { registerGracefulShutdown } from "./app/gracefulShutdown.js";
import { createAiAnalyzeRouter } from "./routes/aiAnalyze.js";
import { createRespondWithSecurityIncident } from "./services/aiSecurityResponseService.js";
import {
    findPersistedDiagnosisByFingerprint,
    persistOrReuseDiagnosis,
    upgradePersistedDiagnosisOutput,
} from "./services/diagnosisPersistence.js";
import { makeDiagnosisFingerprint } from "./services/analysisFingerprint.js";

dotenv.config();

// Log explicite de la valeur CLINIA_MOCK_AI au tout début du backend
console.log("[BOOT] CLINIA_MOCK_AI (raw env):", process.env.CLINIA_MOCK_AI);

mongoose.set("bufferCommands", false);

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

const makeFingerprint = makeDiagnosisFingerprint;

function makeSourceHash(sourceStrings) {
    return crypto
        .createHash("sha256")
        .update(JSON.stringify(sourceStrings))
        .digest("hex");
}

function getRequestIp(req) {
    return getTrustedRequestIp(req);
}

const JSON_MODELS = new Set([
    "gpt-4.1-mini",
    "gpt-4.1",
    "gpt-4o-mini",
]);

function supportsJsonResponseFormat(model = "") {
    return JSON_MODELS.has(model);
}

const startServer = createStartServer({
    mongoose,
    initShutdownState,
    registerGracefulShutdown,
});

const respondWithSecurityIncident = createRespondWithSecurityIncident({
    createSecurityIncident,
    recordOpenAIRequestAuditEvent,
    buildBlockingIncidentResponse,
    makeSourceHash,
});

const aiAnalyzeRouter = createAiAnalyzeRouter({
    openai,
    assessCloudClinicalPayload,
    buildCloudSafePatientPayload,
    sanitizeRequestPayload,
    validateAnalyzeRequestShape,
    validateClinicalInputBounds,
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

registerRoutes(app, {
    massDownloadRestrictionGuard,
    patientsMassDownloadDetector,
    openAILogsExportMassDownloadDetector,
    aiAnalyzeRouter,
});

registerErrorHandlers(app);

startServer({
    app,
});
