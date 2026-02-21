import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import crypto from "crypto";
import OpenAI from "openai";

import { safeParseMedicalAI } from "./utils/aiParser.js";
import { getMockForDiagnosis } from "./utils/mockLoader.js";
import { DiagnosisResult } from "./models/DiagnosisResult.js";

import {
    canCallOpenAI,
    recordOpenAISuccess,
    recordOpenAIFailure,
} from "./utils/openaiCircuitBreaker.js";

import appointmentsRouter from "./routes/appointments.js";
import patientsRouter from "./routes/patients.js";
import cliniquesRouter from "./routes/cliniques.js";
import specialistsRouter from "./routes/specialists.js";

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

/* ================================================================== */
/* /api/ai/analyze                                                    */
/* ================================================================== */

app.post("/api/ai/analyze", async (req, res) => {
    try {
        const { symptoms = [], forceReal, openaiModel } = req.body;

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
        const fingerprint = makeFingerprint({ diagnosis, patient });

        const isProd =
            process.env.NODE_ENV === "production" ||
            process.env.CLINIA_FORCE_MOCK === "true";
        const forceRealSafe = !isProd && forceReal === true;
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

        try {
            const completion =
                await openai.chat.completions.create(
                    request
                );

            const parsed = safeParseMedicalAI(
                completion.choices[0].message.content
            );

            normalized = normalizeClinicalAnalysis(parsed);
            recordOpenAISuccess();
        } catch (err) {
            console.error("❌ OpenAI error:", err.message);
            recordOpenAIFailure();

            const degraded = normalizeClinicalAnalysis({});
            return res.json({
                data: degraded,
                meta: {
                    source: "degraded",
                    model: "fallback",
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
            return res.json({ error: persist.error });

        return res.json({
            data: persist.doc.output,
            meta: { source: "real", model },
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

/* ------------------------------------------------------------------ */
/* Mongo / Server                                                     */
/* ------------------------------------------------------------------ */

mongoose
    .connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 2000, // ⏱️ max 2 secondes si Mongo est down
    })
    .then(() => {
        console.log("✅ MongoDB connecté (ClinIA)");
        console.log(
            "CLINIA_MOCK_AI =",
            process.env.CLINIA_MOCK_AI
        );
        console.log(
            "OPENAI_MODEL =",
            process.env.OPENAI_MODEL
        );
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

app.listen(4000, () =>
    console.log(
        "🚀 ClinIA backend ready on http://localhost:4000"
    )
);
