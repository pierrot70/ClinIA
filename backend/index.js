import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";

import OpenAI from "openai";
import { safeParseMedicalAI } from "./utils/aiParser.js";
import { getMockForDiagnosis, getAllMocks, saveAllMocks } from "./utils/mockLoader.js";


const app = express();
app.use(cors());
app.use(express.json());

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

// --- Admin login (JWT) ---
app.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body;

    if (
        username !== process.env.CLINIA_ADMIN_USERNAME ||
        password !== process.env.CLINIA_ADMIN_PASSWORD
    ) {
        return res.status(401).json({ error: "Identifiants invalides" });
    }

    const token = jwt.sign(
        { role: "admin" },
        process.env.JWT_SECRET,
        { expiresIn: "8h" }
    );

    res.json({ token });
});

// --- Mock simple (existant) ---
app.get("/api/treatments", (req, res) => {
    res.json({
        diagnosis: "Hypertension essentielle (mock)",
        treatments: [
            { name: "Indapamide", efficacy: 94 },
            { name: "Amlodipine", efficacy: 89 },
            { name: "Candesartan", efficacy: 85 }
        ]
    });
});

// --- Health check ---
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

// --- Mock Studio API : récupérer tous les mocks ---
app.get("/api/mocks", requireAdmin, (req, res) => {
    try {
        const mocks = getAllMocks();
        res.json(mocks);
    } catch (err) {
        console.error("Error reading mocks:", err);
        res.status(500).json({ error: "Cannot read mocks" });
    }
});

// --- Mock Studio API : sauvegarder tous les mocks ---
app.put("/api/mocks", requireAdmin, (req, res) => {
    try {
        const newData = req.body;
        saveAllMocks(newData);
        res.json({ ok: true });
    } catch (err) {
        console.error("Error saving mocks:", err);
        res.status(400).json({ error: "Cannot save mocks", details: err.message });
    }
});

// --- OpenAI config ---
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// --- Route IA principale ---
app.post("/api/ai/analyze", async (req, res) => {
    try {
        const { diagnosis, patient } = req.body;

        if (!diagnosis) {
            return res.status(400).json({ error: "Diagnosis is required." });
        }

        // --- MODE MOCK IA (activé si .env -> CLINIA_MOCK_AI=true) ----
        if (process.env.CLINIA_MOCK_AI === "true") {
            console.log("🟡 ClinIA: MODE MOCK IA (AVANCÉ) ACTIVÉ");

            const mock = getMockForDiagnosis(diagnosis);
            return res.json({ analysis: mock });
        }

        // --------------------------------------------------------
        // 🌟 MODE IA RÉELLE (OpenAI)
        // --------------------------------------------------------

        const prompt = `
Tu es ClinIA, un assistant clinique conçu pour aider les médecins.
Tu DOIS répondre STRICTEMENT en JSON, sans aucun texte avant ou après.

Diagnostic fourni : ${diagnosis}

Contexte patient (simulé et non réel) :
${JSON.stringify(patient, null, 2)}

FORMAT JSON OBLIGATOIRE :

{
  "patient_summary": "Phrase courte expliquant la situation au patient.",
  "treatments": [
    {
      "name": "Nom du traitement",
      "justification": "Justification médicale courte.",
      "contraindications": [
        "Contre-indication 1",
        "Contre-indication 2"
      ],
      "efficacy": 85
    }
  ]
}

Règles :
- "efficacy" est un nombre de 0 à 100.
- Les contre-indications doivent être un tableau de chaînes.
- Pas d’essais expérimentaux.
- Ne remplace jamais le jugement clinique.
        `;

        const aiResponse = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: "Tu es ClinIA, assistant clinique." },
                { role: "user", content: prompt }
            ],
            temperature: 0.1
        });

        const text = aiResponse.choices[0].message.content;

        const structured = safeParseMedicalAI(text);
        res.json({ analysis: structured });

    } catch (err) {
        console.error("OpenAI error:", err);
        res.status(500).json({ error: "Erreur IA", details: err.message });
    }
});

app.listen(4000, () => console.log("Backend ClinIA sur port 4000"));
