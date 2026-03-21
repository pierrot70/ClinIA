import express from "express";
import { getOrCreateTranslation } from "../services/translationService.js";

const router = express.Router();

// POST /translation
router.post("/", async (req, res) => {
  try {
    const { text, targetLang, namespace, sourceLocale } = req.body;
    if (!text || !targetLang) {
      return res.status(400).json({ error: "Missing text or targetLang" });
    }
    const payload = await getOrCreateTranslation({
      text,
      targetLang,
      namespace: namespace || "clinical-demo",
      sourceLocale: sourceLocale || "fr",
    });
    res.json({ translation: payload.text });
  } catch (err) {
    console.error("Translation error:", err);
    res.status(500).json({ error: "Translation failed" });
  }
});

export default router;
