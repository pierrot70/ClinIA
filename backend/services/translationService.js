import { UiTranslationCache } from "../models/UiTranslationCache.js";
import crypto from "crypto";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function hashSourceText(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export async function getOrCreateTranslation({
  namespace = "clinical-demo",
  sourceLocale = "fr",
  targetLang,
  text,
  openaiModel,
  allowCreate = true,
}) {
  const sourceHash = hashSourceText(text);
  let cache = await UiTranslationCache.findOne({
    namespace,
    sourceLocale,
    targetLang,
    sourceHash,
  });
  if (cache) {
    return cache.payload;
  }
  if (!allowCreate) {
    throw {
      code: "TRANSLATION_CACHE_MISS",
      message: "Authentification requise pour creer une nouvelle traduction.",
    };
  }
  // Call OpenAI for translation
  const model = openaiModel || process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const prompt = `Traduire ce texte en ${targetLang}: ${text}`;
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: `You are a professional medical translator.` },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 512,
  });
  const translated = completion.choices[0]?.message?.content?.trim() || "";
  // Save to DB
  cache = await UiTranslationCache.create({
    namespace,
    sourceLocale,
    targetLang,
    sourceHash,
    payload: { text: translated },
  });
  return cache.payload;
}
