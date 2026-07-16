import { UiTranslationCache } from "../models/UiTranslationCache.js";
import crypto from "crypto";

function hashSourceText(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export async function getCachedTranslation({
  namespace = "clinical-demo",
  sourceLocale = "fr",
  targetLang,
  text,
}) {
  const sourceHash = hashSourceText(text);
  const cache = await UiTranslationCache.findOne({
    namespace,
    sourceLocale,
    targetLang,
    sourceHash,
  });
  if (!cache) {
    throw {
      code: "TRANSLATION_CACHE_MISS",
      message: "Traduction non disponible dans le cache local.",
    };
  }

  return cache.payload;
}
