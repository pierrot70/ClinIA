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

async function persistDiagnosis(payload) {
    try {
        await DiagnosisResult.create(payload);
        return { ok: true };
    } catch (err) {
        console.error("Mongo persist error:", err.message);
        return {
            ok: false,
            error: {
                source: "mongo",
                message:
                    "Impossible d’enregistrer l’analyse en base de données.",
            },
        };
    }
}

/* ------------------------------------------------------------------ */
/* Route IA                                                           */
/* ------------------------------------------------------------------ */

app.post("/api/ai/analyze", async (req, res) => {
    const { symptoms = [], forceReal } = req.body;

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

    const useMock = process.env.CLINIA_MOCK_AI === "true" && forceReal !== true;

    /* ---------------- MOCK ---------------- */
    if (useMock) {
        const analysis = getMockForDiagnosis(diagnosis);

        const persist = await persistDiagnosis({
            fingerprint,
            input: patient,
            output: analysis,
            mode: "mock",
        });

        if (!persist.ok) {
            return res.json({ error: persist.error });
        }

        return res.json({
            data: analysis,
            meta: { source: "mock" },
        });
    }

    /* ---------------- OPENAI ---------------- */
    let raw;
    try {
        const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL,
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "user",
                    content: JSON.stringify(patient),
                },
            ],
            temperature: 0.1,
        });

        raw = safeParseMedicalAI(
            completion.choices[0].message.content
        );
    } catch (err) {
        console.error("OpenAI error:", err.message);
        return res.json({
            error: {
                source: "openai",
                message:
                    "Le service d’analyse clinique (IA) est temporairement indisponible.",
            },
        });
    }

    const persist = await persistDiagnosis({
        fingerprint,
        input: patient,
        output: raw,
        mode: "real",
        model: process.env.OPENAI_MODEL,
    });

    if (!persist.ok) {
        return res.json({ error: persist.error });
    }

    return res.json({
        data: raw,
        meta: { source: "real" },
    });
});

/* ------------------------------------------------------------------ */
/* Mongo / Server                                                     */
/* ------------------------------------------------------------------ */

mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB connecté (ClinIA)"))
    .catch((err) => console.error("Mongo error:", err));

app.listen(4000, () =>
    console.log("ClinIA backend ready on http://localhost:4000")
);
