//-----------------------------------------------------
// 1. IMPORTS
//-----------------------------------------------------
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

import OpenAI from "openai";
import { safeParseMedicalAI } from "./utils/aiParser.js";
import { getMockForDiagnosis, getAllMocks, saveAllMocks } from "./utils/mockLoader.js";

import { AdminUser } from "./models/AdminUser.js";
import { DiagnosisResult } from "./models/DiagnosisResult.js";
import crypto from "crypto";



dotenv.config();

//-----------------------------------------------------
// 2. EXPRESS INIT
//-----------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json());

//-----------------------------------------------------
// 🔒 GLOBAL Rate limit OpenAI (tous clients confondus)
// Configurable via ENV:
// - CLINIA_REAL_AI_WINDOW_SECONDS (default 300 = 5 min)
// - CLINIA_REAL_AI_MAX (default 1)
// Appliqué seulement si on va appeler OpenAI (pas en mock)
//-----------------------------------------------------
const AI_GLOBAL_WINDOW_MS =
    (Number(process.env.CLINIA_REAL_AI_WINDOW_SECONDS) || 300) * 1000;

const AI_GLOBAL_MAX = Number(process.env.CLINIA_REAL_AI_MAX) || 1;

// État global en mémoire (OK pour 1 droplet / 1 instance)
let aiGlobal = { windowStart: 0, count: 0 };

function rateLimitGlobalAI(req, res, next) {
    const now = Date.now();

    // reset fenêtre si expirée
    if (!aiGlobal.windowStart || now - aiGlobal.windowStart >= AI_GLOBAL_WINDOW_MS) {
        aiGlobal = { windowStart: now, count: 0 };
    }

    if (aiGlobal.count >= AI_GLOBAL_MAX) {
        const resetAt = aiGlobal.windowStart + AI_GLOBAL_WINDOW_MS;
        const retryAfterSec = Math.ceil((resetAt - now) / 1000);

        res.setHeader("Retry-After", String(retryAfterSec));
        res.setHeader("X-RateLimit-Limit", String(AI_GLOBAL_MAX));
        res.setHeader("X-RateLimit-Remaining", "0");
        res.setHeader("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));

        return res.status(429).json({
            error: "Too many requests",
            details: `Global rate limit: ${AI_GLOBAL_MAX} real AI request(s) per ${Math.round(
                AI_GLOBAL_WINDOW_MS / 1000
            )} seconds`,
            retry_after_seconds: retryAfterSec,
        });
    }

    aiGlobal.count += 1;

    const resetAt = aiGlobal.windowStart + AI_GLOBAL_WINDOW_MS;
    res.setHeader("X-RateLimit-Limit", String(AI_GLOBAL_MAX));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, AI_GLOBAL_MAX - aiGlobal.count)));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));

    next();
}

function makeFingerprint({ diagnosis, patient }) {
    const normalized = {
        diagnosis: diagnosis.trim().toLowerCase(),
        patient: patient ?? {},
    };

    return crypto
        .createHash("sha256")
        .update(JSON.stringify(normalized))
        .digest("hex");
}


//-----------------------------------------------------
// 3. MIDDLEWARE EVALUEUR DE TOKEN ADMIN
//-----------------------------------------------------
function requireAdmin(req, res, next) {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token) {
        return res.status(401).json({ error: "Admin token missing" });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (payload.role !== "admin") {
            return res.status(403).json({ error: "Forbidden" });
        }
        next();
    } catch (err) {
        console.error("JWT error:", err.message);
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}

//-----------------------------------------------------
// 5. LOGIN ADMIN (bcrypt + JWT)
//-----------------------------------------------------
app.post("/api/admin/login", async (req, res) => {
    const { username, password } = req.body;

    const user = await AdminUser.findOne({ username });
    if (!user) {
        return res.status(401).json({ error: "Utilisateur admin inconnu" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
        return res.status(401).json({ error: "Mot de passe invalide" });
    }

    const token = jwt.sign({ role: "admin", id: user._id }, process.env.JWT_SECRET, {
        expiresIn: "8h",
    });

    res.json({ token });
});

//-----------------------------------------------------
// 6. ROUTES MOCK STUDIO (protégées)
//-----------------------------------------------------
app.get("/api/mocks", requireAdmin, (req, res) => {
    try {
        res.json(getAllMocks());
    } catch (err) {
        console.error("Error reading mocks:", err);
        res.status(500).json({ error: "Cannot read mocks" });
    }
});

app.put("/api/mocks", requireAdmin, (req, res) => {
    try {
        saveAllMocks(req.body);
        res.json({ ok: true });
    } catch (err) {
        console.error("Error saving mocks:", err);
        res.status(400).json({ error: "Cannot save mocks", details: err.message });
    }
});

//-----------------------------------------------------
// 7. ROUTES STANDARD
//-----------------------------------------------------
app.get("/api/treatments", (req, res) => {
    res.json({
        diagnosis: "Hypertension essentielle (mock)",
        treatments: [
            { name: "Indapamide", efficacy: 94 },
            { name: "Amlodipine", efficacy: 89 },
            { name: "Candesartan", efficacy: 85 },
        ],
    });
});

app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

//-----------------------------------------------------
// 8. OPENAI CLIENT
//-----------------------------------------------------
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

//-----------------------------------------------------
// 8.1 NORMALISATION IA (garantit patient_summary + treatments)
//-----------------------------------------------------
function normalizeAnalysis(raw) {
    const obj = raw && typeof raw === "object" ? raw : {};

    const patient_summary =
        obj.patient_summary ??
        obj.patientSummary ??
        obj.summary ??
        obj.summary_patient ??
        obj.patient?.summary ??
        "";

    const treatmentsRaw =
        obj.treatments ??
        obj.treatment_plan ??
        obj.recommended_treatments ??
        obj.recommendations ??
        [];

    const treatments = Array.isArray(treatmentsRaw) ? treatmentsRaw : [];

    return { patient_summary, treatments };
}

//-----------------------------------------------------
// 9. ROUTE IA PRINCIPALE
//-----------------------------------------------------
//-----------------------------------------------------
// 9. ROUTE IA PRINCIPALE
//-----------------------------------------------------
app.post("/api/ai/analyze", async (req, res) => {
    try {
        const { diagnosis, patient, forceReal } = req.body;

        if (!diagnosis) {
            return res.status(400).json({ error: "Diagnosis is required." });
        }

        const useMock = process.env.CLINIA_MOCK_AI === "true" && forceReal !== true;

        // Helper de persistance (ne casse jamais la réponse)
        async function persistDiagnosis({ analysis, mode }) {
            const fingerprint = makeFingerprint({ diagnosis, patient });

            // 🔍 Vérifie si déjà existant
            const existing = await DiagnosisResult.findOne({ fingerprint });
            if (existing) {
                console.log("🟦 Diagnostic déjà existant, pas de duplication");
                return existing;
            }

            try {
                return await DiagnosisResult.create({
                    fingerprint,
                    input: { diagnosis, patient: patient ?? {}, forceReal: forceReal === true },
                    output: { analysis },
                    mode,
                    model: mode === "real" ? process.env.OPENAI_MODEL : "mock",
                });
            } catch (e) {
                // 🛡️ Sécurité en cas de race condition
                if (e.code === 11000) {
                    return DiagnosisResult.findOne({ fingerprint });
                }
                throw e;
            }
        }


        if (useMock) {
            console.log("🟡 ClinIA: MODE MOCK IA");
            const mock = getMockForDiagnosis(diagnosis);
            const analysis = normalizeAnalysis(mock);

            // ✅ sauvegarde
            await persistDiagnosis({ analysis, mode: "mock" });

            return res.json({ analysis });
        }

        // ✅ GLOBAL rate limit configurable via ENV (seulement pour l'IA réelle)
        return rateLimitGlobalAI(req, res, async () => {
            try {
                console.log(
                    `🟢 ClinIA: MODE IA RÉEL (OpenAI) [global rate limit: ${AI_GLOBAL_MAX}/${Math.round(
                        AI_GLOBAL_WINDOW_MS / 1000
                    )}s]`
                );

                const prompt = `
Tu es ClinIA, assistant clinique.
Répond STRICTEMENT en JSON (un seul objet), sans texte hors JSON.

Tu dois produire EXACTEMENT cette forme:
{
  "patient_summary": "string",
  "treatments": [
    {
      "name": "string",
      "justification": "string",
      "contraindications": ["string"],
      "efficacy": 0
    }
  ]
}

Règles:
- patient_summary: 1-3 phrases max.
- efficacy: nombre entre 0 et 100.
- contraindications: tableau (vide si aucune).

Diagnostic: ${diagnosis}
Patient: ${JSON.stringify(patient ?? {}, null, 2)}
`;

                const aiResponse = await openai.chat.completions.create({
                    model: process.env.OPENAI_MODEL,
                    response_format: { type: "json_object" },
                    messages: [
                        { role: "system", content: "ClinIA assistant clinique." },
                        { role: "user", content: prompt },
                    ],
                    temperature: 0.1,
                });

                const raw = safeParseMedicalAI(aiResponse.choices[0].message.content);
                const analysis = normalizeAnalysis(raw);

                // ✅ sauvegarde
                await persistDiagnosis({ analysis, mode: "real" });

                return res.json({ analysis });
            } catch (err) {
                console.error("OpenAI error:", err);
                return res.status(500).json({ error: "Erreur IA", details: err.message });
            }
        });
    } catch (err) {
        console.error("Route error:", err);
        return res.status(500).json({ error: "Erreur IA", details: err.message });
    }
});


//-----------------------------------------------------
// 10. MONGO CONNEXION
//-----------------------------------------------------
mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB connecté (ClinIA)"))
    .catch((err) => console.error("Erreur MongoDB:", err));

//-----------------------------------------------------
// 11. LANCEMENT SERVEUR
//-----------------------------------------------------
app.listen(4000, () => console.log("Backend ClinIA sur http://localhost:4000 🚀"));
