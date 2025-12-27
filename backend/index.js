import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import crypto from "crypto";
import OpenAI from "openai";

import { safeParseMedicalAI } from "./utils/aiParser.js";
import { getMockForDiagnosis } from "./utils/mockLoader.js";
import { DiagnosisResult } from "./models/DiagnosisResult.js";

dotenv.config();

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

/**
 * 🔑 NORMALISATION — CONTRAT FRONT GARANTI
 */
function normalizeClinicalAnalysis(raw) {
    const pa = raw?.patient_analysis ?? raw ?? {};

    return {
        diagnosis: {
            suspected: pa.blood_pressure_status
                ? "Diabète de type 2 avec hypertension"
                : "Analyse clinique en cours",
            certainty_level: "moderate",
            justification:
                "Analyse basée sur symptômes, antécédents et paramètres cliniques disponibles.",
        },

        treatments: [],
        alternatives: [],
        red_flags: [],

        patient_summary: {
            plain_language: Array.isArray(pa.clinical_recommendations)
                ? pa.clinical_recommendations.join(" ")
                : "Analyse clinique générée par ClinIA.",
            clinical_language: Array.isArray(pa.symptoms_analysis)
                ? pa.symptoms_analysis.join(" ")
                : "Analyse clinique structurée.",
        },

        meta: {
            model: process.env.OPENAI_MODEL ?? "unknown",
            confidence_score: 0.6,
        },
    };
}

/**
 * 🧠 PERSISTENCE INTELLIGENTE
 * - create si possible
 * - si duplicate key → on relit et on retourne
 */
async function persistOrReuseDiagnosis(payload) {
    try {
        const created = await DiagnosisResult.create(payload);
        return { ok: true, doc: created };
    } catch (err) {
        // 🔁 DUPLICATE KEY = CACHE HIT
        if (err.code === 11000) {
            const existing = await DiagnosisResult.findOne({
                fingerprint: payload.fingerprint,
            }).lean();

            if (existing) {
                return { ok: true, doc: existing };
            }
        }

        console.error("❌ Mongo persist error:", err.message);
        return {
            ok: false,
            error: {
                source: "mongo",
                message:
                    "Erreur technique lors de la persistance de l’analyse.",
            },
        };
    }
}

/* ================================================================== */
/* /api/ai/analyze                                                    */
/* ================================================================== */

app.post("/api/ai/analyze", async (req, res) => {
    const { symptoms = [], forceReal } = req.body;

    console.log("🔥 PAYLOAD REÇU:\n", JSON.stringify(req.body, null, 2));

    if (!Array.isArray(symptoms) || symptoms.length === 0) {
        return res.json({
            error: {
                source: "internal",
                message:
                    "Données cliniques insuffisantes pour lancer l’analyse.",
            },
        });
    }

    const diagnosis = "To be determined by ClinIA";
    const patient = req.body;
    const fingerprint = makeFingerprint({ diagnosis, patient });

    const useMock =
        process.env.CLINIA_MOCK_AI === "true" && forceReal !== true;

    /* ---------------- MOCK ---------------- */
    if (useMock) {
        const mock = getMockForDiagnosis(diagnosis);
        const analysis = normalizeClinicalAnalysis(mock);

        const persist = await persistOrReuseDiagnosis({
            fingerprint,
            input: patient,
            output: analysis,
            mode: "mock",
            model: "mock",
        });

        if (!persist.ok) return res.json({ error: persist.error });

        return res.json({
            data: persist.doc.output,
            meta: { source: "mock" },
        });
    }

    /* ---------------- OPENAI ---------------- */
    let normalized;

    try {
        const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL,
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content:
                        "You are ClinIA, a clinical decision support system. Respond ONLY in valid JSON.",
                },
                {
                    role: "user",
                    content: `Patient data:\n${JSON.stringify(patient, null, 2)}`,
                },
            ],
            temperature: 0.1,
        });

        const parsed = safeParseMedicalAI(
            completion.choices[0].message.content
        );

        normalized = normalizeClinicalAnalysis(parsed);
    } catch (err) {
        console.error("❌ OpenAI analyze error:", err.message);
        return res.json({
            error: {
                source: "openai",
                message:
                    "Le service d’analyse clinique (IA) est temporairement indisponible.",
            },
        });
    }

    const persist = await persistOrReuseDiagnosis({
        fingerprint,
        input: patient,
        output: normalized,
        mode: "real",
        model: process.env.OPENAI_MODEL ?? "unknown",
    });

    if (!persist.ok) return res.json({ error: persist.error });

    return res.json({
        data: persist.doc.output,
        meta: { source: "real" },
    });
});

/* ------------------------------------------------------------------ */
/* Mongo / Server                                                     */
/* ------------------------------------------------------------------ */

mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB connecté (ClinIA)"))
    .catch((err) => console.error("❌ Mongo error:", err));

app.listen(4000, () =>
    console.log("🚀 ClinIA backend ready on http://localhost:4000")
);
