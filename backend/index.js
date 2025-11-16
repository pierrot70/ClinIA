import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

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

import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

app.post("/api/ai/analyze", async (req, res) => {
    try {
        const { diagnosis, patient } = req.body;

        if (!diagnosis) {
            return res.status(400).json({ error: "Diagnosis is required." });
        }

        // Prompt professionnel, optimisé pour un usage médical
        const prompt = `
Tu es ClinIA, un assistant clinique conçu pour aider les médecins.
Tu DOIS être clair, concis et neutre.
Ton rôle est d’expliquer les options possibles APRÈS le diagnostic, pas de diagnostiquer.

Diagnostic fourni : ${diagnosis}

Contexte patient (simulé et non réel) :
${JSON.stringify(patient, null, 2)}

Donne :
1. Les trois options de traitement les plus pertinentes
2. Une phrase de justification médicale pour chacune
3. Les principales contre-indications
4. Un résumé patient (pour explication simple)
NE DONNE PAS de recommandations illégales ou expérimentales.
NE REMPLACE PAS le jugement clinique.
    `;

        const aiResponse = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL,
            messages: [
                { role: "system", content: "Tu es ClinIA, assistant clinique." },
                { role: "user", content: prompt }
            ],
            temperature: 0.1
        });

        const text = aiResponse.choices[0].message.content;
        res.json({ analysis: text });

    } catch (err) {
        console.error("OpenAI error:", err);
        res.status(500).json({ error: "Erreur IA", details: err.message });
    }
});


app.listen(4000, () => console.log("Backend ClinIA sur port 4000"));
