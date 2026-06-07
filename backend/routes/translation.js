import express from "express";
import { getOrCreateTranslation } from "../services/translationService.js";
import { attachOptionalAuth } from "../middleware/attachOptionalAuth.js";
import { AUTH_ROLES } from "../auth/constants.js";

const router = express.Router();

// POST /translation
router.post("/", attachOptionalAuth, async (req, res) => {
  try {
    const { text, targetLang, namespace, sourceLocale, translated, forceSave, openaiModel } = req.body;
    if (!text || !targetLang) {
      return res.status(400).json({ error: "Missing text or targetLang" });
    }
    // Si forceSave et translated sont fournis, on sauvegarde explicitement la traduction locale
    if (forceSave && translated) {
      if (![AUTH_ROLES.ADMIN, AUTH_ROLES.SUPERADMIN].includes(req.auth?.role)) {
        return res.status(req.auth ? 403 : 401).json({
          error: {
            code: req.auth ? "FORBIDDEN" : "UNAUTHORIZED",
            message: req.auth
              ? "Permissions insuffisantes."
              : "Authentification requise.",
            retryable: false,
          },
        });
      }
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
          payload: { text: translated },
        });
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
      allowCreate: Boolean(req.auth),
    });
    res.json({ translation: payload.text });
  } catch (err) {
    if (err.code === "TRANSLATION_CACHE_MISS") {
      return res.status(401).json({
        error: {
          code: err.code,
          message: err.message,
          retryable: false,
        },
      });
    }
    console.error("Translation error:", err);
    res.status(500).json({ error: "Translation failed" });
  }
});

export default router;
