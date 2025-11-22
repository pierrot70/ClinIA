import express from "express";
import cors from "cors";
import { safeParseMedicalAI } from "./utils/aiParser.js";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json());

// --- Mock simple ---
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
