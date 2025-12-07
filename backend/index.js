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
import {
    getMockForDiagnosis,
    getAllMocks,
    saveAllMocks
} from "./utils/mockLoader.js";

import { AdminUser } from "./models/AdminUser.js";

dotenv.config();

//-----------------------------------------------------
// 2. EXPRESS INIT
//-----------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json());

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
// 4. ROUTE TEMPORAIRE POUR CRÉER L’ADMIN (À SUPPRIMER)
//-----------------------------------------------------
// app.post("/api/admin/init", async (req, res) => {
//     const { username, password } = req.body;
//
//     const exists = await AdminUser.findOne({ username });
//     if (exists) return res.status(400).json({ error: "Admin already exists" });
//
//     const passwordHash = await bcrypt.hash(password, 12);
//
//     const admin = new AdminUser({ username, passwordHash });
//     await admin.save();
//
//     res.json({ ok: true });
// });

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

    const token = jwt.sign(
        { role: "admin", id: user._id },
        process.env.JWT_SECRET,
        { expiresIn: "8h" }
    );

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
            { name: "Candesartan", efficacy: 85 }
        ]
    });
});

app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

//-----------------------------------------------------
// 8. OPENAI CLIENT
//-----------------------------------------------------
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

//-----------------------------------------------------
// 9. ROUTE IA PRINCIPALE
//-----------------------------------------------------
app.post("/api/ai/analyze", async (req, res) => {
    try {
        const { diagnosis, patient, forceReal } = req.body;

        if (!diagnosis) {
            return res.status(400).json({ error: "Diagnosis is required." });
        }

        // ✅ Toggle par requête:
        // - si CLINIA_MOCK_AI=true -> on MOCK, SAUF si forceReal=true
        const useMock = process.env.CLINIA_MOCK_AI === "true" && forceReal !== true;

        if (useMock) {
            console.log("🟡 ClinIA: MODE MOCK IA ACTIVÉ (forceReal=false)");
            const mock = getMockForDiagnosis(diagnosis);
            return res.json({ analysis: mock });
        }

        console.log("🟢 ClinIA: MODE IA RÉEL (OpenAI) (forceReal=true ou CLINIA_MOCK_AI!=true)");

        // --- ton code OpenAI ICI (inchangé) ---
        const prompt = `
Tu es ClinIA, assistant clinique.
Répond STRICTEMENT en JSON — aucun texte hors JSON.

Diagnostic : ${diagnosis}
Patient : ${JSON.stringify(patient, null, 2)}
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

        const structured = safeParseMedicalAI(aiResponse.choices[0].message.content);
        return res.json({ analysis: structured });
    } catch (err) {
        console.error("OpenAI error:", err);
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
app.listen(4000, () =>
    console.log("Backend ClinIA sur http://localhost:4000 🚀")
);
