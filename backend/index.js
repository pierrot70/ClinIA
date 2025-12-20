//-----------------------------------------------------
// 1. IMPORTS
//-----------------------------------------------------
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import crypto from "crypto";

import OpenAI from "openai";
import { safeParseMedicalAI } from "./utils/aiParser.js";
import { getMockForDiagnosis, getAllMocks, saveAllMocks } from "./utils/mockLoader.js";

import { AdminUser } from "./models/AdminUser.js";
import { DiagnosisResult } from "./models/DiagnosisResult.js";

dotenv.config();

//-----------------------------------------------------
// 2. EXPRESS INIT
//-----------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json());

//-----------------------------------------------------
// 3. GLOBAL RATE LIMIT IA (NON BLOQUANT UI)
//-----------------------------------------------------
const AI_GLOBAL_WINDOW_MS =
    (Number(process.env.CLINIA_REAL_AI_WINDOW_SECONDS) || 300) * 1000;
const AI_GLOBAL_MAX = Number(process.env.CLINIA_REAL_AI_MAX) || 1;

let aiGlobal = { start: 0, count: 0 };

function rateLimitGlobalAI(req, res, next) {
    const now = Date.now();
    if (!aiGlobal.start || now - aiGlobal.start >= AI_GLOBAL_WINDOW_MS) {
        aiGlobal = { start: now, count: 0 };
    }
    if (aiGlobal.count < AI_GLOBAL_MAX) {
        aiGlobal.count += 1;
    }
    next(); // ⚠️ ne bloque JAMAIS l’UI
}

//-----------------------------------------------------
// 4. SAFE MONGO PERSIST (NE BLOQUE JAMAIS)
//-----------------------------------------------------
async function safePersist(payload) {
    try {
        await DiagnosisResult.create(payload);
    } catch (err) {
        console.warn("⚠️ Mongo persist ignoré:", err.message);
    }
}

function makeFingerprint({ diagnosis, patient }) {
    return crypto
        .createHash("sha256")
        .update(JSON.stringify({ diagnosis, patient }))
        .digest("hex");
}

//-----------------------------------------------------
// 5. ADMIN AUTH
//-----------------------------------------------------
function requireAdmin(req, res, next) {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Admin token missing" });

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (payload.role !== "admin") return res.status(403).json({ error: "Forbidden" });
        next();
    } catch {
        return res.status(401).json({ error: "Invalid token" });
    }
}

//-----------------------------------------------------
// 6. ADMIN LOGIN
//-----------------------------------------------------
app.post("/api/admin/login", async (req, res) => {
    const { username, password } = req.body;

    const user = await AdminUser.findOne({ username });
    if (!user) return res.status(401).json({ error: "Unknown admin" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid password" });

    const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET, {
        expiresIn: "8h",
    });

    res.json({ token });
});

//-----------------------------------------------------
// 7. MOCK STUDIO
//-----------------------------------------------------
app.get("/api/mocks", requireAdmin, (req, res) => res.json(getAllMocks()));
app.put("/api/mocks", requireAdmin, (req, res) => {
    saveAllMocks(req.body);
    res.json({ ok: true });
});

//-----------------------------------------------------
// 8. HEALTH
//-----------------------------------------------------
app.get("/health", (req, res) => res.json({ status: "ok" }));

//-----------------------------------------------------
// 9. OPENAI CLIENT
//-----------------------------------------------------
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

//-----------------------------------------------------
// 10. NORMALISATION CLINIQUE (ALIGNÉ FRONTEND)
//-----------------------------------------------------
function normalizeAnalysis(raw) {
    const obj = raw && typeof raw === "object" ? raw : {};

    return {
        diagnosis: {
            suspected:
                obj.diagnosis?.suspected ??
                obj.diagnosis ??
                "Indéterminé",
            certainty_level:
                obj.diagnosis?.certainty_level ??
                obj.certainty_level ??
                "low",
            justification:
                obj.diagnosis?.justification ??
                obj.justification ??
                "Données cliniques insuffisantes pour conclure.",
        },

        treatments: Array.isArray(obj.treatments) ? obj.treatments : [],
        alternatives: Array.isArray(obj.alternatives) ? obj.alternatives : [],
        red_flags: Array.isArray(obj.red_flags) ? obj.red_flags : [],

        patient_summary: {
            plain_language:
                obj.patient_summary?.plain_language ??
                obj.patient_summary ??
                "Analyse clinique en cours.",
            clinical_language:
                obj.patient_summary?.clinical_language ??
                "Analyse clinique assistée par ClinIA.",
        },

        meta: {
            model: obj.meta?.model ?? "clinia",
            confidence_score: obj.meta?.confidence_score ?? 0,
        },
    };
}

//-----------------------------------------------------
// 11. ROUTE IA PRINCIPALE (CLINIA — JAMAIS DE 500)
//-----------------------------------------------------
app.post("/api/ai/analyze", async (req, res) => {
    try {
        const {
            age,
            sex,
            symptoms,
            medical_history,
            current_medications,
            forceReal,
        } = req.body;

        // Validation clinique minimale (NON BLOQUANTE UI)
        if (!age || !sex || !Array.isArray(symptoms) || symptoms.length === 0) {
            return res.status(200).json({
                diagnosis: {
                    suspected: "Indéterminé",
                    certainty_level: "low",
                    justification:
                        "Informations cliniques insuffisantes pour analyse.",
                },
                treatments: [],
                alternatives: [],
                red_flags: ["Données cliniques incomplètes"],
                patient_summary: {
                    plain_language:
                        "Nous avons besoin de plus d’informations pour analyser votre situation.",
                    clinical_language:
                        "Données cliniques insuffisantes pour analyse.",
                },
                meta: { model: "fallback", confidence_score: 0 },
            });
        }

        const patient = {
            age,
            sex,
            symptoms,
            medical_history: medical_history ?? [],
            current_medications: current_medications ?? [],
        };

        const diagnosis = "To be determined by ClinIA";
        const useMock = process.env.CLINIA_MOCK_AI === "true" && forceReal !== true;

        // ---------- MOCK ----------
        if (useMock) {
            const mock = getMockForDiagnosis(diagnosis);
            const analysis = normalizeAnalysis(mock);

            safePersist({
                fingerprint: makeFingerprint({ diagnosis, patient }),
                input: patient,
                output: analysis,
                mode: "mock",
            });

            return res.status(200).json(analysis);
        }

        // ---------- IA RÉELLE ----------
        return rateLimitGlobalAI(req, res, async () => {
            let raw = {};

            try {
                const prompt = `
You are ClinIA, a clinical decision support system.
Return ONLY valid JSON.

Patient:
${JSON.stringify(patient, null, 2)}
`;

                const ai = await openai.chat.completions.create({
                    model: process.env.OPENAI_MODEL,
                    response_format: { type: "json_object" },
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.1,
                });

                raw = safeParseMedicalAI(ai.choices[0].message.content);
            } catch (err) {
                console.warn("⚠️ OpenAI / parsing error → fallback utilisé");
            }

            const analysis = normalizeAnalysis(raw);

            safePersist({
                fingerprint: makeFingerprint({ diagnosis, patient }),
                input: patient,
                output: analysis,
                mode: "real",
                model: process.env.OPENAI_MODEL,
            });

            return res.status(200).json(analysis);
        });
    } catch (err) {
        console.error("❌ ClinIA fatal error:", err);

        return res.status(200).json({
            diagnosis: {
                suspected: "Indéterminé",
                certainty_level: "low",
                justification:
                    "Erreur technique interne. Analyse interrompue.",
            },
            treatments: [],
            alternatives: [],
            red_flags: ["Erreur système"],
            patient_summary: {
                plain_language:
                    "Une erreur technique empêche l’analyse pour le moment.",
                clinical_language:
                    "Analyse interrompue suite à une erreur système.",
            },
            meta: { model: "fallback", confidence_score: 0 },
        });
    }
});

//-----------------------------------------------------
// 12. MONGO
//-----------------------------------------------------
mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB connecté (ClinIA)"))
    .catch((err) => console.error("Erreur MongoDB:", err));

//-----------------------------------------------------
// 13. SERVER
//-----------------------------------------------------
app.listen(4000, () =>
    console.log("Backend ClinIA sur http://localhost:4000 🚀")
);
