import express from "express";
import { getCachedTranslation } from "../services/translationService.js";
import { APPROVED_UI_TRANSLATION_CATALOG } from "../scripts/i18n/approvedUiTranslationCatalog.js";

const router = express.Router();

// These values mirror the language and model choices exposed by the UI.
// The translation endpoint must not be a client-controlled OpenAI proxy.
const ALLOWED_TRANSLATION_LANGUAGES = new Set([
  "fr",
  "fr-CA",
  "en",
  "en-CA",
  "es",
  "ko-KR",
  "vi",
  "no-NO",
  "ja",
  "zh",
  "he",
]);

const APPROVED_TRANSLATIONS_BY_KEY = new Map(
  APPROVED_UI_TRANSLATION_CATALOG.map((entry) => [entry.key, entry])
);

function validateTranslationRequest({ targetLang, translationKey }) {
  if (!ALLOWED_TRANSLATION_LANGUAGES.has(targetLang)) {
    return {
      code: "INVALID_TRANSLATION_LANGUAGE",
      message: "Langue de traduction non autorisee.",
    };
  }

  if (!APPROVED_TRANSLATIONS_BY_KEY.has(translationKey)) {
    return {
      code: "INVALID_TRANSLATION_KEY",
      message: "Libelle de traduction non autorise.",
    };
  }

  return null;
}

// POST /translation
// The browser supplies an opaque UI key only. It can never submit text to the
// backend for translation or cache lookup.
router.post("/", async (req, res) => {
  try {
    const { translationKey, targetLang, translated, forceSave } = req.body;
    if (!translationKey || !targetLang) {
      return res.status(400).json({ error: "Missing translationKey or targetLang" });
    }

    const validationError = validateTranslationRequest({
      targetLang,
      translationKey,
    });
    if (validationError) {
      return res.status(400).json({
        error: {
          ...validationError,
          retryable: false,
        },
      });
    }

    if (forceSave || translated) {
      return res.status(403).json({
        error: {
          code: "TRANSLATION_CACHE_READ_ONLY",
          message: "Le cache de traduction est en lecture seule.",
          retryable: false,
        },
      });
    }

    const approvedTranslation = APPROVED_TRANSLATIONS_BY_KEY.get(translationKey);

    const payload = await getCachedTranslation({
      text: approvedTranslation.text,
      targetLang,
      namespace: approvedTranslation.namespace,
      sourceLocale: "fr",
    });
    res.json({ translation: payload.text });
  } catch (err) {
    if (err.code === "TRANSLATION_CACHE_MISS") {
      return res.status(404).json({
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
