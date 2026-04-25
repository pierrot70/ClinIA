import express from "express";
import { getOrCreateTranslation } from "../services/translationService.js";

const router = express.Router();

// POST /translation
router.post("/", async (req, res) => {
  try {
    const { text, targetLang, namespace, sourceLocale, translated, forceSave, openaiModel } = req.body;
    if (!text || !targetLang) {
      return res.status(400).json({ error: "Missing text or targetLang" });
    }
    // Si forceSave et translated sont fournis, on sauvegarde explicitement la traduction locale
    if (forceSave && translated) {
      const { UiTranslationCache } = await import("../models/UiTranslationCache.js");
      const crypto = await import("crypto");
      const sourceHash = crypto.createHash("sha256").update(text).digest("hex");
      let cache = await UiTranslationCache.findOne({
        namespace: namespace || "clinical-demo",
        sourceLocale: sourceLocale || "fr",
        targetLang,
        sourceHash,
      });
      if (!cache) {
        cache = await UiTranslationCache.create({
          namespace: namespace || "clinical-demo",
          sourceLocale: sourceLocale || "fr",
          targetLang,
          sourceHash,
          sourceText: text,
          payload: { text: translated },
          model: "manual",
        });
      } else {
        cache.payload = { text: translated };
        cache.sourceText = text;
        cache.model = "manual";
        await cache.save();
      }
      return res.json({ translation: translated });
    }
    // Sinon, comportement normal
    const payload = await getOrCreateTranslation({
      text,
      targetLang,
      namespace: namespace || "clinical-demo",
      sourceLocale: sourceLocale || "fr",
      openaiModel,
    });
    res.json({ translation: payload.text });
  } catch (err) {
    console.error("Translation error:", err);
    res.status(500).json({ error: "Translation failed" });
  }
});

export default router;
